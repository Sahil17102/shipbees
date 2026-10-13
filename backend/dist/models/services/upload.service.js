"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.presignDownload = exports.deleteStoredObjects = exports.normalizeR2ObjectKey = exports.downloadAndUploadToR2 = exports.uploadBufferToR2 = exports.presignUpload = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const axios_1 = __importDefault(require("axios"));
const r2Client_1 = require("../../config/r2Client");
const r2Storage_1 = require("../../config/r2Storage");
const functions_1 = require("../../utils/functions");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 24h
const PRESIGN_CACHE_SAFETY_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry
const R2_UPLOAD_TIMEOUT_MS = Number(process.env.R2_UPLOAD_TIMEOUT_MS || 30000);
const R2_BUFFER_UPLOAD_ATTEMPTS = Math.min(3, Math.max(1, Number(process.env.R2_BUFFER_UPLOAD_ATTEMPTS || 2)));
const R2_BUFFER_UPLOAD_RETRY_DELAY_MS = Number(process.env.R2_BUFFER_UPLOAD_RETRY_DELAY_MS || 500);
const presignDownloadCache = new Map();
const isTransientR2UploadError = (error) => {
    const statusCode = Number(error?.$metadata?.httpStatusCode || error?.statusCode || 0);
    const code = String(error?.code || error?.name || '').toUpperCase();
    return (error?.name === 'AbortError' ||
        statusCode === 408 ||
        statusCode === 425 ||
        statusCode === 429 ||
        statusCode >= 500 ||
        ['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'NETWORKINGERROR'].includes(code));
};
const presignCacheKey = (bucket, key, options) => JSON.stringify({
    bucket,
    key,
    disposition: options?.disposition || null,
    downloadName: options?.downloadName || null,
    contentType: options?.contentType || null,
});
const buildStorageKey = (folderKey, userId, filename) => (0, r2Storage_1.withR2ObjectPrefix)(`${folderKey}/${userId}/${filename}`);
const presignUpload = async ({ filename, contentType, userId, folderKey = 'userPp', }) => {
    const bucket = (0, functions_1.getBucketName)();
    const key = buildStorageKey(folderKey, userId, `${Date.now()}-${(0, functions_1.sanitizeFilename)(filename)}`);
    const command = new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, { expiresIn: 60 * 5 }); // 5 min
    const publicUrl = (0, r2Storage_1.buildR2PublicUrl)(bucket, key);
    return { uploadUrl, key, publicUrl, bucket };
};
exports.presignUpload = presignUpload;
/**
 * Upload an authenticated browser file through the API instead of exposing a
 * browser-to-R2 dependency. The caller supplies a stable uploadId so a retry
 * after a dropped response overwrites the same object rather than creating an
 * orphaned duplicate.
 */
const uploadBufferToR2 = async ({ buffer, filename, contentType, userId, uploadId, folderKey = 'userPp', cacheControl, }) => {
    const bucket = (0, functions_1.getBucketName)();
    const key = buildStorageKey(folderKey, userId, `${uploadId}-${(0, functions_1.sanitizeFilename)(filename)}`);
    let lastError;
    for (let attempt = 1; attempt <= R2_BUFFER_UPLOAD_ATTEMPTS; attempt += 1) {
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), R2_UPLOAD_TIMEOUT_MS);
        try {
            await r2Client_1.r2.send(new client_s3_1.PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
                CacheControl: cacheControl,
            }), { abortSignal: abortController.signal });
            // Do not tell the client that a sensitive KYC document is ready until R2
            // confirms the object can be read. A retry uses the same key, so a reset
            // after a successful PUT cannot create an orphaned duplicate.
            await r2Client_1.r2.send(new client_s3_1.HeadObjectCommand({ Bucket: bucket, Key: key }), {
                abortSignal: abortController.signal,
            });
            return {
                key,
                publicUrl: (0, r2Storage_1.buildR2PublicUrl)(bucket, key),
                bucket,
            };
        }
        catch (error) {
            lastError = error;
            if (attempt >= R2_BUFFER_UPLOAD_ATTEMPTS || !isTransientR2UploadError(error)) {
                throw error;
            }
        }
        finally {
            clearTimeout(timeout);
        }
        await new Promise((resolve) => setTimeout(resolve, R2_BUFFER_UPLOAD_RETRY_DELAY_MS * attempt));
    }
    throw lastError || new Error('R2 upload failed');
};
exports.uploadBufferToR2 = uploadBufferToR2;
/**
 * Download a file from a URL and upload it to R2, returning only the S3 key
 * This ensures we store keys only, not external URLs
 */
const downloadAndUploadToR2 = async ({ url, userId, filename, folderKey = 'labels', contentType = 'application/pdf', }) => {
    try {
        const bucket = (0, functions_1.getBucketName)();
        // Check if the input is a valid URL (starts with http:// or https://)
        const isValidUrl = /^https?:\/\//i.test(url);
        if (!isValidUrl) {
            // If it's not a URL, treat it as an R2 key
            // Check if it looks like an R2 key (contains slashes, doesn't start with http)
            console.log(`ℹ️ Input is not a URL, treating as R2 key: ${url}`);
            // If it's already a key (contains folder structure), return it as-is
            if (url.includes('/')) {
                console.log(`✅ Using existing R2 key: ${url}`);
                return url;
            }
            // If it's just a filename, construct a proper key path
            // This handles cases where Delhivery returns just a filename
            const key = buildStorageKey(folderKey, userId, (0, functions_1.sanitizeFilename)(url));
            console.log(`✅ Constructed R2 key from filename: ${key}`);
            return key;
        }
        // If it's already an R2 URL, extract the key instead of re-uploading
        const extractedKey = extractKeyFromUrl(url, bucket);
        if (extractedKey) {
            console.log(`ℹ️ URL is already an R2 URL, using existing key: ${extractedKey}`);
            return extractedKey;
        }
        // Download the file from the URL (external URL)
        console.log(`📥 Downloading file from URL: ${url}`);
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
        });
        const fileBuffer = Buffer.from(response.data);
        // Upload to R2
        console.log(`📤 Uploading downloaded file to R2: ${filename}`);
        const { uploadUrl, key } = await (0, exports.presignUpload)({
            filename,
            contentType,
            userId,
            folderKey,
        });
        if (!uploadUrl || !key) {
            console.error('❌ Failed to get presigned upload URL');
            return null;
        }
        await axios_1.default.put(Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl, fileBuffer, {
            headers: { 'Content-Type': contentType },
            timeout: R2_UPLOAD_TIMEOUT_MS,
        });
        const finalKey = Array.isArray(key) ? key[0] : key;
        console.log(`✅ File uploaded to R2 successfully: ${finalKey}`);
        return finalKey;
    }
    catch (error) {
        console.error('❌ Failed to download and upload file to R2:', {
            url,
            filename,
            error: error?.message || error,
            stack: error?.stack,
        });
        return null;
    }
};
exports.downloadAndUploadToR2 = downloadAndUploadToR2;
/**
 * Extract S3/R2 key from a full URL
 * Example: https://xxx.r2.cloudflarestorage.com/bucket-name/folder/file.pdf -> folder/file.pdf
 */
const normalizeR2ObjectKey = (value, bucket = (0, functions_1.getBucketName)()) => {
    const trimmed = String(value || '').trim();
    if (!trimmed)
        return null;
    if (!/^https?:\/\//i.test(trimmed)) {
        return trimmed.includes('..') ? null : trimmed.replace(/^\/+/, '');
    }
    return extractKeyFromUrl(trimmed, bucket);
};
exports.normalizeR2ObjectKey = normalizeR2ObjectKey;
const extractKeyFromUrl = (url, bucket) => {
    try {
        const sharedExtractorKey = (0, r2Storage_1.extractR2KeyFromUrl)(url, bucket);
        if (sharedExtractorKey)
            return sharedExtractorKey;
        // Check if it's an R2 URL that contains our bucket
        if (url.includes(bucket)) {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // Find bucket index and return everything after it
            const bucketIndex = pathParts.indexOf(bucket);
            if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
                return pathParts.slice(bucketIndex + 1).join('/');
            }
        }
        // If it's an R2 endpoint URL format, try to extract key
        if (process.env.R2_ENDPOINT && url.startsWith(process.env.R2_ENDPOINT)) {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // Skip bucket name (first part) and get the rest as key
            if (pathParts.length > 1) {
                return pathParts.slice(1).join('/');
            }
        }
        return null;
    }
    catch (error) {
        console.error('Error extracting key from URL:', url, error);
        return null;
    }
};
/**
 * Permanently remove app-owned documents referenced by a privacy request.
 * External courier URLs are intentionally skipped because this R2 client must
 * never attempt to delete resources outside Shipray's own bucket.
 */
const deleteStoredObjects = async (references) => {
    const bucket = (0, functions_1.getBucketName)();
    const keys = Array.from(new Set(references
        .map((reference) => String(reference || '').trim())
        .filter(Boolean)
        .map((reference) => {
        if (/^https?:\/\//i.test(reference))
            return extractKeyFromUrl(reference, bucket);
        return reference.includes('/') && !reference.includes('..') ? reference : null;
    })
        .filter((key) => Boolean(key))));
    if (!keys.length)
        return { deleted: 0, skipped: references.filter(Boolean).length };
    const results = await Promise.allSettled(keys.map((key) => r2Client_1.r2.send(new client_s3_1.DeleteObjectCommand({ Bucket: bucket, Key: key }))));
    const failures = results
        .map((result, index) => ({ result, key: keys[index] }))
        .filter(({ result }) => result.status === 'rejected');
    if (failures.length) {
        throw new Error(`Failed to delete ${failures.length} Shopify privacy document(s): ${failures
            .map(({ key }) => key)
            .join(', ')}`);
    }
    presignDownloadCache.clear();
    return {
        deleted: keys.length,
        skipped: Math.max(0, references.filter(Boolean).length - keys.length),
    };
};
exports.deleteStoredObjects = deleteStoredObjects;
const isMissingObjectError = (error) => error?.name === 'NotFound' ||
    error?.name === 'NoSuchKey' ||
    error?.code === 'NotFound' ||
    error?.code === 'NoSuchKey' ||
    error?.$metadata?.httpStatusCode === 404 ||
    error?.message?.includes('NotFound') ||
    error?.message?.includes('NoSuchKey') ||
    error?.message?.includes('404');
const ensureObjectExists = async (bucket, key) => {
    try {
        await r2Client_1.r2.send(new client_s3_1.HeadObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        return true;
    }
    catch (error) {
        if (isMissingObjectError(error)) {
            console.warn('⚠️ File missing in R2 storage:', { bucket, key });
            return false;
        }
        throw error;
    }
};
const buildPresignedDownloadUrl = async (bucket, rawValue, now, options) => {
    const value = rawValue.trim();
    if (!value) {
        console.warn('⚠️ Empty key provided to presignDownload');
        return null;
    }
    const responseContentDisposition = options?.disposition && options?.downloadName
        ? `${options.disposition}; filename="${options.downloadName}"`
        : undefined;
    const responseContentType = options?.contentType;
    let storageKey = value;
    if (/^https?:\/\//i.test(value)) {
        const extractedKey = extractKeyFromUrl(value, bucket);
        if (!extractedKey) {
            console.warn(`⚠️ Could not extract S3 key from URL, returning as-is: ${value}`);
            return value;
        }
        storageKey = extractedKey;
        console.log(`🔄 Extracted key from URL: ${storageKey}, regenerating presigned URL`);
    }
    if (options?.checkExists) {
        const exists = await ensureObjectExists(bucket, storageKey);
        if (!exists) {
            return null;
        }
    }
    const cacheKey = presignCacheKey(bucket, storageKey, options);
    const cached = presignDownloadCache.get(cacheKey);
    if (cached && cached.expiresAt - PRESIGN_CACHE_SAFETY_BUFFER_MS > now) {
        return cached.url;
    }
    console.log(`🔄 Presigning download URL for key: ${storageKey} in bucket: ${bucket}`);
    const command = new client_s3_1.GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ResponseContentDisposition: responseContentDisposition,
        ResponseContentType: responseContentType,
    });
    const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, {
        expiresIn: PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS,
    });
    console.log(`✅ Presigned URL generated successfully for key: ${storageKey}`);
    presignDownloadCache.set(cacheKey, {
        url: signedUrl,
        expiresAt: now + PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS * 1000,
    });
    return signedUrl;
};
const presignDownload = async (keyOrKeys, options) => {
    try {
        const bucket = (0, functions_1.getBucketName)();
        const now = Date.now();
        if (typeof keyOrKeys === 'string') {
            return buildPresignedDownloadUrl(bucket, keyOrKeys, now, options);
        }
        const urls = await Promise.all(keyOrKeys.map((key) => buildPresignedDownloadUrl(bucket, key, now, options)));
        return urls;
    }
    catch (error) {
        if (isMissingObjectError(error)) {
            console.error('❌ File not found in S3/R2:', {
                keys: keyOrKeys,
                error: error?.message || error,
            });
            return typeof keyOrKeys === 'string' ? null : keyOrKeys.map(() => null);
        }
        console.error('❌ Error generating presigned download URL(s):', {
            error: error?.message || error,
            stack: error?.stack,
            keys: keyOrKeys,
        });
        throw new Error(`Failed to generate presigned URL(s): ${error?.message || 'Unknown error'}`);
    }
};
exports.presignDownload = presignDownload;
