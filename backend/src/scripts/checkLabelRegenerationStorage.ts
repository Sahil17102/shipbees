import assert from 'assert'
import { buildVersionedLabelUploadId } from '../utils/labelStorage'

const orderId = 'order-123'
const originalPdf = Buffer.from('label with original delivery address')
const updatedPdf = Buffer.from('label with updated delivery address')

const originalKey = buildVersionedLabelUploadId({
  orderId,
  labelIdentifier: '10001',
  pdfBuffer: originalPdf,
})
const retryKey = buildVersionedLabelUploadId({
  orderId,
  labelIdentifier: '10001',
  pdfBuffer: originalPdf,
})
const updatedKey = buildVersionedLabelUploadId({
  orderId,
  labelIdentifier: '10001',
  pdfBuffer: updatedPdf,
})

assert.strictEqual(retryKey, originalKey, 'An identical upload retry must remain idempotent')
assert.notStrictEqual(
  updatedKey,
  originalKey,
  'A changed label must receive a new immutable storage reference',
)
assert.match(originalKey, /^label-[A-Za-z0-9_-]+-[a-f0-9]{24}$/)
assert.match(updatedKey, /^label-[A-Za-z0-9_-]+-[a-f0-9]{24}$/)

console.log('Label regeneration storage check passed', {
  identicalRetryIsStable: retryKey === originalKey,
  changedLabelGetsNewReference: updatedKey !== originalKey,
})
