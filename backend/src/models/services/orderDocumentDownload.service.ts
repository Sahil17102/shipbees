import archiver = require('archiver')
import axios from 'axios'
import { PDFDocument } from 'pdf-lib'
import { Response } from 'express'
import { and, eq, inArray } from 'drizzle-orm'
import { Readable } from 'stream'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { b2bOrderListSelect, b2cOrderListSelect } from './orderListSelects'
import { getOrderLabelReference } from '../../utils/orderLabels'
import { presignDownload } from './upload.service'
import { generateLabelForOrder } from './generateCustomLabelService'

export type BulkDocumentType = 'label' | 'invoice' | 'manifest'

export const MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT = 100
export const MAX_BULK_LABEL_DOWNLOAD_LIMIT = 50

type OrderRow = {
  id: string
  type: 'b2c' | 'b2b'
  order_number?: string | null
  awb_number?: string | null
  integration_type?: string | null
  courier_partner?: string | null
  label?: string | null
  invoice_link?: string | null
  manifest?: string | null
}

type PreparedDocumentEntry = {
  fileName: string
  orderLabel: string
  downloadUrl: string
}

type FullOrderRow = Record<string, any>

const downloadDocumentBuffer = async (url: string, retryTransientDownloads: boolean) => {
  let lastError: unknown
  const maxAttempts = retryTransientDownloads ? 2 : 1

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
      })
      return response.data
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
  }

  throw lastError
}

const createHttpError = (message: string, statusCode: number) =>
  Object.assign(new Error(message), { statusCode })

const normalizeDocumentReference = (value?: string | null) => {
  const text = String(value || '').trim()
  return text || null
}

const sanitizeFileNameSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const isHttpUrl = (value?: string | null) => typeof value === 'string' && /^https?:\/\//i.test(value)

const isProviderHostedVelocityLabel = (order: OrderRow, reference?: string | null) =>
  String(order.integration_type || '').trim().toLowerCase() === 'velocity' && isHttpUrl(reference)

const getFileExtension = (value?: string | null) => {
  if (!value) return '.pdf'

  const path = isHttpUrl(value)
    ? (() => {
        try {
          return new URL(value).pathname
        } catch {
          return value
        }
      })()
    : value

  const match = path.match(/\.[a-z0-9]+$/i)
  return match?.[0] || '.pdf'
}

const getDocumentReference = (order: OrderRow, type: BulkDocumentType) => {
  if (type === 'label') {
    return normalizeDocumentReference(getOrderLabelReference(order))
  }

  if (type === 'manifest') {
    return normalizeDocumentReference(order.manifest)
  }

  return normalizeDocumentReference(order.invoice_link)
}

const getDownloadFileName = (order: OrderRow, type: BulkDocumentType, source?: string | null) => {
  const baseName =
    sanitizeFileNameSegment(String(order.order_number || order.awb_number || `${order.type}-${order.id}`)) ||
    `order-${order.id}`

  return `${baseName}-${type}${getFileExtension(source)}`
}

const getOrderDocumentLabel = (order: OrderRow) =>
  String(order.order_number || order.awb_number || order.id)

const fetchFullOrderForGeneration = async (order: OrderRow): Promise<FullOrderRow | null> => {
  if (order.type === 'b2c') {
    const [row] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, order.id)).limit(1)
    return row || null
  }

  const [row] = await db.select().from(b2b_orders).where(eq(b2b_orders.id, order.id)).limit(1)
  return row || null
}

const updateOrderLabelReference = async (order: OrderRow, labelKey: string) => {
  if (order.type === 'b2c') {
    await db.update(b2c_orders).set({ label: labelKey }).where(eq(b2c_orders.id, order.id))
    return
  }

  await db.update(b2b_orders).set({ label: labelKey }).where(eq(b2b_orders.id, order.id))
}

const resolveGeneratedLabelDownloadUrl = async (order: OrderRow) => {
  const fullOrder = await fetchFullOrderForGeneration(order)
  if (!fullOrder?.user_id) {
    throw new Error('Order not found for label generation')
  }

  const labelKey = await generateLabelForOrder(fullOrder, String(fullOrder.user_id), db)
  const normalizedLabelKey = String(labelKey || '').trim()
  if (!normalizedLabelKey) {
    throw new Error('Label generation returned an empty label reference')
  }

  await updateOrderLabelReference(order, normalizedLabelKey)

  const resolved = await presignDownload(normalizedLabelKey, { checkExists: true })
  const downloadUrl = Array.isArray(resolved) ? resolved[0] : resolved
  if (!downloadUrl) {
    throw new Error('Generated label could not be downloaded')
  }

  return {
    fileName: getDownloadFileName(order, 'label', normalizedLabelKey),
    orderLabel: getOrderDocumentLabel(order),
    downloadUrl: String(downloadUrl),
  } satisfies PreparedDocumentEntry
}

const getDownloadName = (documentType: BulkDocumentType) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (documentType === 'label') {
    return `shipray-${documentType}s-${stamp}.pdf`
  }

  return `shipray-${documentType}s-${stamp}.zip`
}

const fetchOrdersForUser = async (userId: string, orderIds: string[]): Promise<OrderRow[]> => {
  const [b2cRows, b2bRows] = await Promise.all([
    db
      .select(b2cOrderListSelect)
      .from(b2c_orders)
      .where(and(eq(b2c_orders.user_id, userId), inArray(b2c_orders.id, orderIds))),
    db
      .select(b2bOrderListSelect)
      .from(b2b_orders)
      .where(and(eq(b2b_orders.user_id, userId), inArray(b2b_orders.id, orderIds))),
  ])

  const orderMap = new Map<string, OrderRow>()

  for (const row of b2cRows) {
    orderMap.set(String(row.id), {
      ...row,
      id: String(row.id),
      type: 'b2c',
    })
  }

  for (const row of b2bRows) {
    orderMap.set(String(row.id), {
      ...row,
      id: String(row.id),
      type: 'b2b',
    })
  }

  return orderIds
    .map((orderId) => orderMap.get(orderId))
    .filter((row): row is OrderRow => Boolean(row))
}

const prepareArchiveEntries = async ({
  documentType,
  orders,
}: {
  documentType: BulkDocumentType
  orders: OrderRow[]
}) => {
  const preparedEntries: PreparedDocumentEntry[] = []
  const missingOrders: string[] = []
  let deduplicatedCount = 0
  const seenReferences = new Set<string>()

  for (const order of orders) {
    const reference = getDocumentReference(order, documentType)
    if (documentType === 'label' && isProviderHostedVelocityLabel(order, reference)) {
      try {
        preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order))
      } catch {
        missingOrders.push(getOrderDocumentLabel(order))
      }
      continue
    }

    if (!reference) {
      if (documentType === 'label') {
        try {
          preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order))
          continue
        } catch {
          missingOrders.push(getOrderDocumentLabel(order))
          continue
        }
      }

      missingOrders.push(getOrderDocumentLabel(order))
      continue
    }

    if (seenReferences.has(reference)) {
      deduplicatedCount += 1
      continue
    }

    seenReferences.add(reference)

    try {
      const resolved = await presignDownload(reference, { checkExists: true })
      const downloadUrl = Array.isArray(resolved) ? resolved[0] : resolved
      if (!downloadUrl) {
        if (documentType === 'label') {
          preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order))
          continue
        }

        missingOrders.push(getOrderDocumentLabel(order))
        continue
      }

      preparedEntries.push({
        fileName: getDownloadFileName(order, documentType, reference),
        orderLabel: getOrderDocumentLabel(order),
        downloadUrl: String(downloadUrl),
      })
    } catch {
      if (documentType === 'label') {
        try {
          preparedEntries.push(await resolveGeneratedLabelDownloadUrl(order))
          continue
        } catch {
          missingOrders.push(getOrderDocumentLabel(order))
          continue
        }
      }

      missingOrders.push(getOrderDocumentLabel(order))
    }
  }

  return { preparedEntries, missingOrders, deduplicatedCount }
}

const applyDownloadHeaders = ({
  response,
  downloadName,
  requestedCount,
  documentCount,
  missingCount,
  deduplicatedCount,
  contentType,
}: {
  response: Response
  downloadName: string
  requestedCount: number
  documentCount: number
  missingCount: number
  deduplicatedCount: number
  contentType: string
}) => {
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
  response.setHeader('X-Shipray-Archive-Name', downloadName)
  response.setHeader('X-Shipray-Requested-Count', String(requestedCount))
  response.setHeader('X-Shipray-Document-Count', String(documentCount))
  response.setHeader('X-Shipray-Missing-Count', String(missingCount))
  response.setHeader('X-Shipray-Deduplicated-Count', String(deduplicatedCount))
}

const streamMergedLabelPdf = async ({
  response,
  preparedEntries,
  requestedCount,
  missingOrders,
  deduplicatedCount,
  retryTransientDownloads,
}: {
  response: Response
  preparedEntries: PreparedDocumentEntry[]
  requestedCount: number
  missingOrders: string[]
  deduplicatedCount: number
  retryTransientDownloads: boolean
}) => {
  const mergedPdf = await PDFDocument.create()
  let mergedDocumentCount = 0

  for (const entry of preparedEntries) {
    try {
      const fileBuffer = await downloadDocumentBuffer(entry.downloadUrl, retryTransientDownloads)
      const sourcePdf = await PDFDocument.load(fileBuffer)
      const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices())
      for (const page of copiedPages) {
        mergedPdf.addPage(page)
      }
      mergedDocumentCount += 1
    } catch {
      missingOrders.push(entry.orderLabel)
    }
  }

  if (!mergedDocumentCount) {
    throw createHttpError('No label PDFs are available yet for the selected orders.', 404)
  }

  const downloadName = getDownloadName('label')
  applyDownloadHeaders({
    response,
    downloadName,
    requestedCount,
    documentCount: mergedDocumentCount,
    missingCount: missingOrders.length,
    deduplicatedCount,
    contentType: 'application/pdf',
  })

  const mergedPdfBytes = await mergedPdf.save()
  response.end(Buffer.from(mergedPdfBytes))
}

const streamBulkOrderDocumentsZip = async ({
  response,
  documentType,
  preparedEntries,
  requestedCount,
  missingOrders,
  deduplicatedCount,
}: {
  response: Response
  documentType: BulkDocumentType
  preparedEntries: PreparedDocumentEntry[]
  requestedCount: number
  missingOrders: string[]
  deduplicatedCount: number
}) => {
  const downloadName = getDownloadName(documentType)
  applyDownloadHeaders({
    response,
    downloadName,
    requestedCount,
    documentCount: preparedEntries.length,
    missingCount: missingOrders.length,
    deduplicatedCount,
    contentType: 'application/zip',
  })

  const archive = new archiver.ZipArchive({ zlib: { level: 9 } })

  await new Promise<void>(async (resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }

    archive.on('warning', (error: Error) => {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        finish(() => reject(error))
      }
    })

    archive.on('error', (error: Error) => {
      finish(() => reject(error))
    })

    response.on('close', () => {
      finish(resolve)
    })

    response.on('error', (error) => {
      finish(() => reject(error))
    })

    archive.pipe(response)

    try {
      for (const entry of preparedEntries) {
        const fileResponse = await axios.get(entry.downloadUrl, {
          responseType: 'stream',
          timeout: 120000,
        })

        archive.append(fileResponse.data as Readable, { name: entry.fileName })
      }

      archive.append(
        JSON.stringify(
          {
            requestedCount,
            includedCount: preparedEntries.length,
            missingCount: missingOrders.length,
            deduplicatedCount,
            missingOrders,
          },
          null,
          2,
        ),
        { name: '_download-summary.json' },
      )

      await archive.finalize()
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

export const streamBulkOrderDocumentsDownload = async ({
  response,
  userId,
  orderIds,
  documentType,
  retryTransientDownloads = false,
}: {
  response: Response
  userId: string
  orderIds: string[]
  documentType: BulkDocumentType
  retryTransientDownloads?: boolean
}) => {
  const normalizedOrderIds = Array.from(
    new Set(orderIds.map((orderId) => String(orderId || '').trim()).filter(Boolean)),
  )

  if (!normalizedOrderIds.length) {
    throw createHttpError('Select at least one order to download documents.', 400)
  }

  const downloadLimit =
    documentType === 'label' ? MAX_BULK_LABEL_DOWNLOAD_LIMIT : MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT

  if (normalizedOrderIds.length > downloadLimit) {
    throw createHttpError(
      documentType === 'label'
        ? `You can download up to ${MAX_BULK_LABEL_DOWNLOAD_LIMIT} labels in one PDF.`
        : `You can download up to ${MAX_BULK_DOCUMENT_DOWNLOAD_LIMIT} orders in one ZIP.`,
      400,
    )
  }

  const orders = await fetchOrdersForUser(userId, normalizedOrderIds)
  if (!orders.length) {
    throw createHttpError('No matching orders were found for this account.', 404)
  }

  const { preparedEntries, missingOrders, deduplicatedCount } = await prepareArchiveEntries({
    documentType,
    orders,
  })

  if (!preparedEntries.length) {
    throw createHttpError(
      documentType === 'label'
        ? 'No label PDFs are available yet for the selected orders.'
        : `No ${documentType} files are available yet for the selected orders.`,
      404,
    )
  }

  if (documentType === 'label') {
    await streamMergedLabelPdf({
      response,
      preparedEntries,
      requestedCount: normalizedOrderIds.length,
      missingOrders,
      deduplicatedCount,
      retryTransientDownloads,
    })
    return
  }

  await streamBulkOrderDocumentsZip({
    response,
    documentType,
    preparedEntries,
    requestedCount: normalizedOrderIds.length,
    missingOrders,
    deduplicatedCount,
  })
}
