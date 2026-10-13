import assert from 'assert/strict'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { handleEmailVerificationRequest } from '../models/services/userService'
import { users } from '../models/schema/users'

const run = async () => {
  const email = `one-time-access-check-${Date.now()}@shipray.local`
  const realPassword = `RealPass-${Date.now()}`
  const oneTimePassword = `OneTime-${Date.now()}`
  const realHash = await bcrypt.hash(realPassword, 10)
  const oneTimeHash = await bcrypt.hash(oneTimePassword, 10)

  try {
    await db.insert(users).values({
      email,
      emailVerified: true,
      role: 'customer',
      passwordHash: realHash,
      oneTimePasswordHash: oneTimeHash,
      oneTimePasswordExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      oneTimePasswordUsedAt: null,
    })

    const oneTimeResult = await handleEmailVerificationRequest(email, oneTimePassword, null)
    assert.equal(oneTimeResult.status, 200, 'one-time password should authenticate once')

    const afterOneTime = await db.query.users.findFirst({
      where: (table, { eq }) => eq(table.email, email),
    })
    assert.ok(afterOneTime, 'test user should still exist')
    assert.equal(afterOneTime?.oneTimePasswordHash, null, 'one-time hash should be cleared')
    assert.equal(
      afterOneTime?.oneTimePasswordExpiresAt,
      null,
      'one-time expiry should be cleared',
    )
    assert.ok(afterOneTime?.oneTimePasswordUsedAt, 'one-time usage should be recorded')
    assert.equal(
      await bcrypt.compare(realPassword, String(afterOneTime?.passwordHash || '')),
      true,
      'original password hash must remain valid',
    )

    const reuseResult = await handleEmailVerificationRequest(email, oneTimePassword, null)
    assert.equal(reuseResult.status, 400, 'one-time password should not be reusable')

    const realPasswordResult = await handleEmailVerificationRequest(email, realPassword, null)
    assert.equal(realPasswordResult.status, 200, 'original password should still authenticate')

    console.log('One-time user access check passed')
  } finally {
    await db.delete(users).where(eq(users.email, email))
  }
}

run().catch((error) => {
  console.error('One-time user access check failed:', error?.message || error)
  process.exit(1)
})
