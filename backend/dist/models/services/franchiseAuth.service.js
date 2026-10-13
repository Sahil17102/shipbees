"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginFranchiseMember = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const jwt_1 = require("../../utils/jwt");
const client_1 = require("../client");
const franchise_1 = require("../schema/franchise");
const users_1 = require("../schema/users");
const userService_1 = require("./userService");
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const loginFranchiseMember = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const [account] = await client_1.db
        .select({
        userId: users_1.users.id,
        email: users_1.users.email,
        passwordHash: users_1.users.passwordHash,
        emailVerified: users_1.users.emailVerified,
        memberId: franchise_1.franchiseMembers.id,
        memberRole: franchise_1.franchiseMembers.role,
        permissions: franchise_1.franchiseMembers.permissions,
        organizationId: franchise_1.franchiseOrganizations.id,
        organizationName: franchise_1.franchiseOrganizations.tradeName,
        organizationStatus: franchise_1.franchiseOrganizations.status,
    })
        .from(users_1.users)
        .innerJoin(franchise_1.franchiseMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseMembers.userId, users_1.users.id), (0, drizzle_orm_1.eq)(franchise_1.franchiseMembers.isActive, true)))
        .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseMembers.organizationId))
        .where((0, drizzle_orm_1.eq)(users_1.users.email, normalizedEmail))
        .limit(1);
    if (!account?.passwordHash) {
        throw new Error('Invalid credentials');
    }
    const passwordMatches = await bcryptjs_1.default.compare(password, account.passwordHash);
    if (!passwordMatches) {
        throw new Error('Invalid credentials');
    }
    if (account.organizationStatus !== 'active') {
        throw new Error('This franchise account is not active');
    }
    const accessToken = (0, jwt_1.signAccessToken)(account.userId, 'franchise');
    const { token: refreshToken } = (0, jwt_1.signRefreshToken)(account.userId, 'franchise');
    await (0, userService_1.saveRefreshToken)(account.userId, refreshToken, ONE_WEEK_MS);
    return {
        token: accessToken,
        refreshToken,
        user: {
            id: account.userId,
            email: account.email,
            emailVerified: account.emailVerified,
            role: account.memberRole,
            permissions: account.permissions,
            organization: {
                id: account.organizationId,
                name: account.organizationName,
            },
        },
    };
};
exports.loginFranchiseMember = loginFranchiseMember;
