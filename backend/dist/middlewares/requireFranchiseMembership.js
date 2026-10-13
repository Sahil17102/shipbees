"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireFranchiseMembership = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const franchise_1 = require("../models/schema/franchise");
const requireFranchiseMembership = async (req, res, next) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const [membership] = await client_1.db
            .select({
            memberId: franchise_1.franchiseMembers.id,
            organizationId: franchise_1.franchiseOrganizations.id,
            organizationName: franchise_1.franchiseOrganizations.tradeName,
            organizationStatus: franchise_1.franchiseOrganizations.status,
            role: franchise_1.franchiseMembers.role,
            permissions: franchise_1.franchiseMembers.permissions,
        })
            .from(franchise_1.franchiseMembers)
            .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseMembers.organizationId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseMembers.userId, userId), (0, drizzle_orm_1.eq)(franchise_1.franchiseMembers.isActive, true)))
            .limit(1);
        if (!membership || membership.organizationStatus !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'An active franchise membership is required',
            });
        }
        req.franchise = {
            memberId: membership.memberId,
            organizationId: membership.organizationId,
            organizationName: membership.organizationName,
            role: membership.role,
            permissions: membership.permissions || [],
        };
        next();
    }
    catch (error) {
        console.error('[requireFranchiseMembership]', error);
        return res.status(500).json({ success: false, message: 'Unable to verify franchise access' });
    }
};
exports.requireFranchiseMembership = requireFranchiseMembership;
