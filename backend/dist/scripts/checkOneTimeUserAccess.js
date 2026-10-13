"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("assert/strict"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const userService_1 = require("../models/services/userService");
const users_1 = require("../models/schema/users");
const run = async () => {
    const email = `one-time-access-check-${Date.now()}@shipray.local`;
    const realPassword = `RealPass-${Date.now()}`;
    const oneTimePassword = `OneTime-${Date.now()}`;
    const realHash = await bcryptjs_1.default.hash(realPassword, 10);
    const oneTimeHash = await bcryptjs_1.default.hash(oneTimePassword, 10);
    try {
        await client_1.db.insert(users_1.users).values({
            email,
            emailVerified: true,
            role: 'customer',
            passwordHash: realHash,
            oneTimePasswordHash: oneTimeHash,
            oneTimePasswordExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
            oneTimePasswordUsedAt: null,
        });
        const oneTimeResult = await (0, userService_1.handleEmailVerificationRequest)(email, oneTimePassword, null);
        strict_1.default.equal(oneTimeResult.status, 200, 'one-time password should authenticate once');
        const afterOneTime = await client_1.db.query.users.findFirst({
            where: (table, { eq }) => eq(table.email, email),
        });
        strict_1.default.ok(afterOneTime, 'test user should still exist');
        strict_1.default.equal(afterOneTime?.oneTimePasswordHash, null, 'one-time hash should be cleared');
        strict_1.default.equal(afterOneTime?.oneTimePasswordExpiresAt, null, 'one-time expiry should be cleared');
        strict_1.default.ok(afterOneTime?.oneTimePasswordUsedAt, 'one-time usage should be recorded');
        strict_1.default.equal(await bcryptjs_1.default.compare(realPassword, String(afterOneTime?.passwordHash || '')), true, 'original password hash must remain valid');
        const reuseResult = await (0, userService_1.handleEmailVerificationRequest)(email, oneTimePassword, null);
        strict_1.default.equal(reuseResult.status, 400, 'one-time password should not be reusable');
        const realPasswordResult = await (0, userService_1.handleEmailVerificationRequest)(email, realPassword, null);
        strict_1.default.equal(realPasswordResult.status, 200, 'original password should still authenticate');
        console.log('One-time user access check passed');
    }
    finally {
        await client_1.db.delete(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.email, email));
    }
};
run().catch((error) => {
    console.error('One-time user access check failed:', error?.message || error);
    process.exit(1);
});
