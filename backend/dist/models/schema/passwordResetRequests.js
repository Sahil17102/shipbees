"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordResetRequests = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.passwordResetRequests = (0, pg_core_1.pgTable)('password_reset_requests', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    otpHash: (0, pg_core_1.varchar)('otp_hash', { length: 200 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    attempts: (0, pg_core_1.integer)('attempts').notNull().default(0),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at', { withTimezone: true }),
    resetTokenHash: (0, pg_core_1.varchar)('reset_token_hash', { length: 128 }),
    resetTokenExpiresAt: (0, pg_core_1.timestamp)('reset_token_expires_at', { withTimezone: true }),
    usedAt: (0, pg_core_1.timestamp)('used_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
