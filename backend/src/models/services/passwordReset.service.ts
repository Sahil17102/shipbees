import crypto from 'crypto'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import * as bcrypt from 'bcryptjs'
import { db } from '../client'
import { passwordResetRequests } from '../schema/passwordResetRequests'
import { users } from '../schema/users'
import { findUserByEmail } from './userService'
import { sendPasswordResetOtpEmail } from '../../utils/emailSender'

const OTP_TTL_MS = 10 * 60 * 1000
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000
const REQUEST_COOLDOWN_MS = 60 * 1000
const MAX_ATTEMPTS = 5

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const generateOtp = () => crypto.randomInt(100000, 1000000).toString()
const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex')

export const requestPasswordReset = async (email: string) => {
  const normalizedEmail = normalizeEmail(email)
  const user = await findUserByEmail(normalizedEmail)

  if (!user) return

  const cooldownSince = new Date(Date.now() - REQUEST_COOLDOWN_MS)
  const [recentRequest] = await db
    .select({ id: passwordResetRequests.id })
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.userId, user.id),
        gt(passwordResetRequests.createdAt, cooldownSince),
      ),
    )
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(1)

  if (recentRequest) return

  const otp = generateOtp()
  await db.insert(passwordResetRequests).values({
    userId: user.id,
    otpHash: await bcrypt.hash(otp, 10),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  })

  await sendPasswordResetOtpEmail(normalizedEmail, otp)
}

export const verifyPasswordResetOtp = async (email: string, otp: string) => {
  const user = await findUserByEmail(normalizeEmail(email))
  if (!user) throw new Error('Invalid or expired reset code')

  const [request] = await db
    .select()
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.userId, user.id),
        isNull(passwordResetRequests.usedAt),
        isNull(passwordResetRequests.verifiedAt),
      ),
    )
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(1)

  if (
    !request ||
    request.attempts >= MAX_ATTEMPTS ||
    request.expiresAt.getTime() < Date.now() ||
    !(await bcrypt.compare(otp.trim(), request.otpHash))
  ) {
    if (request && request.attempts < MAX_ATTEMPTS) {
      await db
        .update(passwordResetRequests)
        .set({ attempts: request.attempts + 1 })
        .where(eq(passwordResetRequests.id, request.id))
    }
    throw new Error('Invalid or expired reset code')
  }

  const resetToken = crypto.randomBytes(32).toString('hex')
  await db
    .update(passwordResetRequests)
    .set({
      verifiedAt: new Date(),
      resetTokenHash: hashToken(resetToken),
      resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
    .where(eq(passwordResetRequests.id, request.id))

  return resetToken
}

export const resetPasswordWithToken = async (
  email: string,
  resetToken: string,
  newPassword: string,
) => {
  const user = await findUserByEmail(normalizeEmail(email))
  if (!user) throw new Error('Invalid or expired reset session')

  const [request] = await db
    .select()
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.userId, user.id),
        eq(passwordResetRequests.resetTokenHash, hashToken(resetToken)),
        isNull(passwordResetRequests.usedAt),
      ),
    )
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(1)

  if (
    !request ||
    !request.verifiedAt ||
    !request.resetTokenExpiresAt ||
    request.resetTokenExpiresAt.getTime() < Date.now()
  ) {
    throw new Error('Invalid or expired reset session')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await bcrypt.hash(newPassword, 10),
        refreshToken: null,
        refreshTokenExpiresAt: null,
        previousRefreshToken: null,
        previousRefreshTokenExpiresAt: null,
      })
      .where(eq(users.id, user.id))

    await tx
      .update(passwordResetRequests)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetRequests.id, request.id))
  })
}
