import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import axios from 'axios'
import { r2 } from '../../config/r2Client'
import { buildR2PublicUrl, extractR2KeyFromUrl, withR2ObjectPrefix } from '../../config/r2Storage'
import { getBucketName, sanitizeFilename } from '../../utils/functions'

import * as dotenv from 'dotenv'
import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

interface PresignParams {
  filename: string
  contentType: string
  userId: string
  folderKey?: string
}

interface BufferUploadParams extends PresignParams {
  buffer: Buffer
  uploadId: string
  cacheControl?: string
}

const PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS = 60 * 60 * 24 // 24h
const PRESIGN_CACHE_SAFETY_BUFFER_MS = 60 * 1000 // refresh 1 min before expiry
const R2_UPLOAD_TIMEOUT_MS = Number(process.env.R2_UPLOAD_TIMEOUT_MS || 30000)
const R2_BUFFER_UPLOAD_ATTEMPTS = Math.min(
  3,
  Math.max(1, Number(process.env.R2_BUFFER_UPLOAD_ATTEMPTS || 2)),
)
const R2_BUFFER_UPLOAD_RETRY_DELAY_MS = Number(
  process.env.R2_BUFFER_UPLOAD_RETRY_DELAY_MS || 500,
)
const presignDownloadCache = new Map<string, { url: string; expiresAt: number }>()

const isTransientR2UploadError = (error: any) => {
  const statusCode = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0)
  const code = String(error?.code || error?.name || '').toUpperCase()

  return (
    error?.name === 'AbortError' ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500 ||
    ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'NETWORKINGERROR'].includes(code)
  )
}

const presignCacheKey = (
  bucket: string,
  key: string,
  options?: {
    downloadName?: string
    disposition?: 'inline' | 'attachment'
    contentType?: string
  },
) =>
  JSON.stringify({
    bucket,
    key,
    disposition: options?.disposition || null,
    downloadName: options?.downloadName || null,
    contentType: options?.contentType || null,
  })

const buildStorageKey = (folderKey: string, userId: string, filename: string) =>
  withR2ObjectPrefix(`${folderKey}/${userId}/${filename}`)

export const presignUpload = async ({
  filename,
  contentType,
  userId,
  folderKey = 'userPp',
}: PresignParams) => {
  const bucket = getBucketName()
  const key = buildStorageKey(folderKey, userId, `${Date.now()}-${sanitizeFilename(filename)}`)

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 60 * 5 }) // 5 min

  const publicUrl = buildR2PublicUrl(bucket, key)
  return { uploadUrl, key, publicUrl, bucket }
}

/**
 * Upload an authenticated browser file through the API instead of exposing a
 * browser-to-R2 dependency. The caller supplies a stable uploadId so a retry
 * after a dropped response overwrites the same object rather than creating an
 * orphaned duplicate.
 */
export const uploadBufferToR2 = async ({
  buffer,
  filename,
  contentType,
  userId,
  uploadId,
  folderKey = 'userPp',
  cacheControl,
}: BufferUploadParams) => {
  const bucket = getBucketName()
  const key = buildStorageKey(folderKey, userId, `${uploadId}-${sanitizeFilename(filename)}`)
  let lastError: unknown

  for (let attempt = 1; attempt <= R2_BUFFER_UPLOAD_ATTEMPTS; attempt += 1) {
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT_MS)

    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
        { abortSignal: abortController.signal },
      )

      // Do not tell the client that a sensitive KYC document is ready until R2
      // confirms the object can be read. A retry uses the same key, so a reset
      // after a successful PUT cannot create an orphaned duplicate.
      await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: abortController.signal,
      })

      return {
        key,
        publicUrl: buildR2PublicUrl(bucket, key),
        bucket,
      }
    } catch (error) {
      lastError = error
      if (attempt >= R2_BUFFER_UPLOAD_ATTEMPTS || !isTransientR2UploadError(error)) {
        throw error
      }
    } finally {
      clearTimeout(timeout)
    }

    await new Promise((resolve) => setTimeout(resolve, R2_BUFFER_UPLOAD_RETRY_DELAY_MS * attempt))
  }

  throw lastError || new Error('R2 upload failed')
}

/**
 * Download a file from a URL and upload it to R2, returning only the S3 key
 * This ensures we store keys only, not external URLs
 */
export const downloadAndUploadToR2 = async ({
  url,
  userId,
  filename,
  folderKey = 'labels',
  contentType = 'application/pdf',
}: {
  url: string
  userId: string
  filename: string
  folderKey?: string
  contentType?: string
}): Promise<string | null> => {
  try {
    const bucket = getBucketName()

    // Check if the input is a valid URL (starts with http:// or https://)
    const isValidUrl = /^https?:\/\//i.test(url)

    if (!isValidUrl) {
      // If it's not a URL, treat it as an R2 key
      // Check if it looks like an R2 key (contains slashes, doesn't start with http)
      console.log(`ℹ️ Input is not a URL, treating as R2 key: ${url}`)

      // If it's already a key (contains folder structure), return it as-is
      if (url.includes('/')) {
        console.log(`✅ Using existing R2 key: ${url}`)
        return url
      }

      // If it's just a filename, construct a proper key path
      // This handles cases where Delhivery returns just a filename
      const key = buildStorageKey(folderKey, userId, sanitizeFilename(url))
      console.log(`✅ Constructed R2 key from filename: ${key}`)
      return key
    }

    // If it's already an R2 URL, extract the key instead of re-uploading
    const extractedKey = extractKeyFromUrl(url, bucket)
    if (extractedKey) {
      console.log(`ℹ️ URL is already an R2 URL, using existing key: ${extractedKey}`)
      return extractedKey
    }

    // Download the file from the URL (external URL)
    console.log(`📥 Downloading file from URL: ${url}`)
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
    })

    const fileBuffer = Buffer.from(response.data)

    // Upload to R2
    console.log(`📤 Uploading downloaded file to R2: ${filename}`)
    const { uploadUrl, key } = await presignUpload({
      filename,
      contentType,
      userId,
      folderKey,
    })

    if (!uploadUrl || !key) {
      console.error('❌ Failed to get presigned upload URL')
      return null
    }

    await axios.put(Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl, fileBuffer, {
      headers: { 'Content-Type': contentType },
      timeout: R2_UPLOAD_TIMEOUT_MS,
    })

    const finalKey = Array.isArray(key) ? key[0] : key
    console.log(`✅ File uploaded to R2 successfully: ${finalKey}`)
    return finalKey
  } catch (error: any) {
    console.error('❌ Failed to download and upload file to R2:', {
      url,
      filename,
      error: error?.message || error,
      stack: error?.stack,
    })
    return null
  }
}

/**
 * Extract S3/R2 key from a full URL
 * Example: https://xxx.r2.cloudflarestorage.com/bucket-name/folder/file.pdf -> folder/file.pdf
 */
export const normalizeR2ObjectKey = (value: string, bucket = getBucketName()): string | null => {
  const trimmed = String(value || '').trim()
  if (!trimmed) return null

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.includes('..') ? null : trimmed.replace(/^\/+/, '')
  }

  return extractKeyFromUrl(trimmed, bucket)
}

const extractKeyFromUrl = (url: string, bucket: string): string | null => {
  try {
    const sharedExtractorKey = extractR2KeyFromUrl(url, bucket)
    if (sharedExtractorKey) return sharedExtractorKey

    // Check if it's an R2 URL that contains our bucket
    if (url.includes(bucket)) {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      // Find bucket index and return everything after it
      const bucketIndex = pathParts.indexOf(bucket)
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        return pathParts.slice(bucketIndex + 1).join('/')
      }
    }
    // If it's an R2 endpoint URL format, try to extract key
    if (process.env.R2_ENDPOINT && url.startsWith(process.env.R2_ENDPOINT)) {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      // Skip bucket name (first part) and get the rest as key
      if (pathParts.length > 1) {
        return pathParts.slice(1).join('/')
      }
    }
    return null
  } catch (error) {
    console.error('Error extracting key from URL:', url, error)
    return null
  }
}

/**
 * Permanently remove app-owned documents referenced by a privacy request.
 * External courier URLs are intentionally skipped because this R2 client must
 * never attempt to delete resources outside Shipray's own bucket.
 */
export const deleteStoredObjects = async (references: Array<string | null | undefined>) => {
  const bucket = getBucketName()
  const keys = Array.from(
    new Set(
      references
        .map((reference) => String(reference || '').trim())
        .filter(Boolean)
        .map((reference) => {
          if (/^https?:\/\//i.test(reference)) return extractKeyFromUrl(reference, bucket)
          return reference.includes('/') && !reference.includes('..') ? reference : null
        })
        .filter((key): key is string => Boolean(key)),
    ),
  )

  if (!keys.length) return { deleted: 0, skipped: references.filter(Boolean).length }

  const results = await Promise.allSettled(
    keys.map((key) => r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))),
  )
  const failures = results
    .map((result, index) => ({ result, key: keys[index] }))
    .filter(({ result }) => result.status === 'rejected')

  if (failures.length) {
    throw new Error(
      `Failed to delete ${failures.length} Shopify privacy document(s): ${failures
        .map(({ key }) => key)
        .join(', ')}`,
    )
  }

  presignDownloadCache.clear()
  return {
    deleted: keys.length,
    skipped: Math.max(0, references.filter(Boolean).length - keys.length),
  }
}

const isMissingObjectError = (error: any) =>
  error?.name === 'NotFound' ||
  error?.name === 'NoSuchKey' ||
  error?.code === 'NotFound' ||
  error?.code === 'NoSuchKey' ||
  error?.$metadata?.httpStatusCode === 404 ||
  error?.message?.includes('NotFound') ||
  error?.message?.includes('NoSuchKey') ||
  error?.message?.includes('404')

const ensureObjectExists = async (bucket: string, key: string) => {
  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    )
    return true
  } catch (error: any) {
    if (isMissingObjectError(error)) {
      console.warn('⚠️ File missing in R2 storage:', { bucket, key })
      return false
    }

    throw error
  }
}

const buildPresignedDownloadUrl = async (
  bucket: string,
  rawValue: string,
  now: number,
  options?: {
    downloadName?: string
    disposition?: 'inline' | 'attachment'
    contentType?: string
    checkExists?: boolean
  },
) => {
  const value = rawValue.trim()

  if (!value) {
    console.warn('⚠️ Empty key provided to presignDownload')
    return null
  }

  const responseContentDisposition =
    options?.disposition && options?.downloadName
      ? `${options.disposition}; filename="${options.downloadName}"`
      : undefined
  const responseContentType = options?.contentType

  let storageKey = value

  if (/^https?:\/\//i.test(value)) {
    const extractedKey = extractKeyFromUrl(value, bucket)
    if (!extractedKey) {
      console.warn(`⚠️ Could not extract S3 key from URL, returning as-is: ${value}`)
      return value
    }

    storageKey = extractedKey
    console.log(`🔄 Extracted key from URL: ${storageKey}, regenerating presigned URL`)
  }

  if (options?.checkExists) {
    const exists = await ensureObjectExists(bucket, storageKey)
    if (!exists) {
      return null
    }
  }

  const cacheKey = presignCacheKey(bucket, storageKey, options)
  const cached = presignDownloadCache.get(cacheKey)
  if (cached && cached.expiresAt - PRESIGN_CACHE_SAFETY_BUFFER_MS > now) {
    return cached.url
  }

  console.log(`🔄 Presigning download URL for key: ${storageKey} in bucket: ${bucket}`)
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ResponseContentDisposition: responseContentDisposition,
    ResponseContentType: responseContentType,
  })
  const signedUrl = await getSignedUrl(r2, command, {
    expiresIn: PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS,
  })
  console.log(`✅ Presigned URL generated successfully for key: ${storageKey}`)
  presignDownloadCache.set(cacheKey, {
    url: signedUrl,
    expiresAt: now + PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS * 1000,
  })
  return signedUrl
}

export const presignDownload = async (
  keyOrKeys: string | string[],
  options?: {
    downloadName?: string
    disposition?: 'inline' | 'attachment'
    contentType?: string
    checkExists?: boolean
  },
): Promise<string | Array<string | null> | null> => {
  try {
    const bucket = getBucketName()
    const now = Date.now()

    if (typeof keyOrKeys === 'string') {
      return buildPresignedDownloadUrl(bucket, keyOrKeys, now, options)
    }

    const urls = await Promise.all(
      keyOrKeys.map((key) => buildPresignedDownloadUrl(bucket, key, now, options)),
    )

    return urls
  } catch (error: any) {
    if (isMissingObjectError(error)) {
      console.error('❌ File not found in S3/R2:', {
        keys: keyOrKeys,
        error: error?.message || error,
      })
      return typeof keyOrKeys === 'string' ? null : keyOrKeys.map(() => null)
    }

    console.error('❌ Error generating presigned download URL(s):', {
      error: error?.message || error,
      stack: error?.stack,
      keys: keyOrKeys,
    })
    throw new Error(`Failed to generate presigned URL(s): ${error?.message || 'Unknown error'}`)
  }
}
