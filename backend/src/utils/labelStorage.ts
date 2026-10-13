import { createHash } from 'crypto'

const sanitizeToken = (value: unknown, fallback: string) =>
  String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const buildVersionedLabelUploadId = ({
  orderId,
  labelIdentifier,
  pdfBuffer,
}: {
  orderId?: unknown
  labelIdentifier: string
  pdfBuffer: Buffer
}) => {
  const orderToken = sanitizeToken(orderId, labelIdentifier).slice(0, 42) || 'order'
  const contentVersion = createHash('sha256').update(pdfBuffer).digest('hex').slice(0, 24)

  return `label-${orderToken}-${contentVersion}`
}
