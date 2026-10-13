import assert from 'node:assert/strict'
import { r2 } from '../config/r2Client'
import { uploadBufferToR2 } from '../models/services/upload.service'

const run = async () => {
  const originalSend = r2.send.bind(r2)
  let calls = 0

  try {
    ;(r2 as any).send = async () => {
      calls += 1
      if (calls === 1) {
        throw Object.assign(new Error('simulated connection reset'), { code: 'ECONNRESET' })
      }
      return {}
    }

    const recovered = await uploadBufferToR2({
      buffer: Buffer.from('shopify-upload-reset-test'),
      filename: 'reset-test.pdf',
      contentType: 'application/pdf',
      userId: 'shopify-review-test',
      uploadId: '00000000-0000-4000-8000-000000000001',
      folderKey: 'kyc',
    })

    assert.equal(calls, 3, 'a reset should retry one PUT and then verify the object with HEAD')
    assert.equal(
      recovered.key,
      'kyc/shopify-review-test/00000000-0000-4000-8000-000000000001-reset-test.pdf',
      'the retry must reuse the same object key',
    )

    calls = 0
    ;(r2 as any).send = async () => {
      calls += 1
      throw Object.assign(new Error('simulated access denied'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      })
    }

    await assert.rejects(
      uploadBufferToR2({
        buffer: Buffer.from('shopify-upload-permanent-error-test'),
        filename: 'permanent-test.pdf',
        contentType: 'application/pdf',
        userId: 'shopify-review-test',
        uploadId: '00000000-0000-4000-8000-000000000002',
        folderKey: 'labels',
      }),
      /simulated access denied/,
    )
    assert.equal(calls, 1, 'a permanent authorization error must not be retried')

    console.log('Shopify upload reset resilience check passed')
  } finally {
    ;(r2 as any).send = originalSend
  }
}

run().catch((error) => {
  console.error('Shopify upload reset resilience check failed:', error)
  process.exit(1)
})
