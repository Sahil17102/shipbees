import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const passwordResetRequests = pgTable('password_reset_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  otpHash: varchar('otp_hash', { length: 200 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  resetTokenHash: varchar('reset_token_hash', { length: 128 }),
  resetTokenExpiresAt: timestamp('reset_token_expires_at', { withTimezone: true }),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
