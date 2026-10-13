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
exports.resetPasswordWithToken = exports.verifyPasswordResetOtp = exports.requestPasswordReset = void 0;
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const bcrypt = __importStar(require("bcryptjs"));
const client_1 = require("../client");
const passwordResetRequests_1 = require("../schema/passwordResetRequests");
const users_1 = require("../schema/users");
const userService_1 = require("./userService");
const emailSender_1 = require("../../utils/emailSender");
const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const normalizeEmail = (email) => email.trim().toLowerCase();
const generateOtp = () => crypto_1.default.randomInt(100000, 1000000).toString();
const hashToken = (token) => crypto_1.default.createHash('sha256').update(token).digest('hex');
const requestPasswordReset = async (email) => {
    const normalizedEmail = normalizeEmail(email);
    const user = await (0, userService_1.findUserByEmail)(normalizedEmail);
    if (!user)
        return;
    const cooldownSince = new Date(Date.now() - REQUEST_COOLDOWN_MS);
    const [recentRequest] = await client_1.db
        .select({ id: passwordResetRequests_1.passwordResetRequests.id })
        .from(passwordResetRequests_1.passwordResetRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.userId, user.id), (0, drizzle_orm_1.gt)(passwordResetRequests_1.passwordResetRequests.createdAt, cooldownSince)))
        .orderBy((0, drizzle_orm_1.desc)(passwordResetRequests_1.passwordResetRequests.createdAt))
        .limit(1);
    if (recentRequest)
        return;
    const otp = generateOtp();
    await client_1.db.insert(passwordResetRequests_1.passwordResetRequests).values({
        userId: user.id,
        otpHash: await bcrypt.hash(otp, 10),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await (0, emailSender_1.sendPasswordResetOtpEmail)(normalizedEmail, otp);
};
exports.requestPasswordReset = requestPasswordReset;
const verifyPasswordResetOtp = async (email, otp) => {
    const user = await (0, userService_1.findUserByEmail)(normalizeEmail(email));
    if (!user)
        throw new Error('Invalid or expired reset code');
    const [request] = await client_1.db
        .select()
        .from(passwordResetRequests_1.passwordResetRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.userId, user.id), (0, drizzle_orm_1.isNull)(passwordResetRequests_1.passwordResetRequests.usedAt), (0, drizzle_orm_1.isNull)(passwordResetRequests_1.passwordResetRequests.verifiedAt)))
        .orderBy((0, drizzle_orm_1.desc)(passwordResetRequests_1.passwordResetRequests.createdAt))
        .limit(1);
    if (!request ||
        request.attempts >= MAX_ATTEMPTS ||
        request.expiresAt.getTime() < Date.now() ||
        !(await bcrypt.compare(otp.trim(), request.otpHash))) {
        if (request && request.attempts < MAX_ATTEMPTS) {
            await client_1.db
                .update(passwordResetRequests_1.passwordResetRequests)
                .set({ attempts: request.attempts + 1 })
                .where((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.id, request.id));
        }
        throw new Error('Invalid or expired reset code');
    }
    const resetToken = crypto_1.default.randomBytes(32).toString('hex');
    await client_1.db
        .update(passwordResetRequests_1.passwordResetRequests)
        .set({
        verifiedAt: new Date(),
        resetTokenHash: hashToken(resetToken),
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    })
        .where((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.id, request.id));
    return resetToken;
};
exports.verifyPasswordResetOtp = verifyPasswordResetOtp;
const resetPasswordWithToken = async (email, resetToken, newPassword) => {
    const user = await (0, userService_1.findUserByEmail)(normalizeEmail(email));
    if (!user)
        throw new Error('Invalid or expired reset session');
    const [request] = await client_1.db
        .select()
        .from(passwordResetRequests_1.passwordResetRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.userId, user.id), (0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.resetTokenHash, hashToken(resetToken)), (0, drizzle_orm_1.isNull)(passwordResetRequests_1.passwordResetRequests.usedAt)))
        .orderBy((0, drizzle_orm_1.desc)(passwordResetRequests_1.passwordResetRequests.createdAt))
        .limit(1);
    if (!request ||
        !request.verifiedAt ||
        !request.resetTokenExpiresAt ||
        request.resetTokenExpiresAt.getTime() < Date.now()) {
        throw new Error('Invalid or expired reset session');
    }
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(users_1.users)
            .set({
            passwordHash: await bcrypt.hash(newPassword, 10),
            refreshToken: null,
            refreshTokenExpiresAt: null,
            previousRefreshToken: null,
            previousRefreshTokenExpiresAt: null,
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, user.id));
        await tx
            .update(passwordResetRequests_1.passwordResetRequests)
            .set({ usedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(passwordResetRequests_1.passwordResetRequests.id, request.id));
    });
};
exports.resetPasswordWithToken = resetPasswordWithToken;
