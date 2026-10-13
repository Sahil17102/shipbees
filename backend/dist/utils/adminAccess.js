"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferRequiredLevel = exports.inferAdminModule = exports.resolveAdminAccess = exports.hasAdminPermission = exports.mergePermissions = exports.ADMIN_PERMISSION_LEVELS = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const adminCrm_1 = require("../models/schema/adminCrm");
const users_1 = require("../models/schema/users");
exports.ADMIN_PERMISSION_LEVELS = ['none', 'view', 'operate', 'approve', 'manage'];
const normalizeLevel = (value) => exports.ADMIN_PERMISSION_LEVELS.includes(value)
    ? value
    : 'none';
const mergePermissions = (rolePermissions, overrides) => ({
    ...(rolePermissions && typeof rolePermissions === 'object' ? rolePermissions : {}),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
});
exports.mergePermissions = mergePermissions;
const hasAdminPermission = (context, module, required = 'view') => {
    if (context.actorType === 'admin')
        return true;
    const current = normalizeLevel(context.permissions[module]);
    return exports.ADMIN_PERMISSION_LEVELS.indexOf(current) >= exports.ADMIN_PERMISSION_LEVELS.indexOf(required);
};
exports.hasAdminPermission = hasAdminPermission;
const resolveAdminAccess = async (userId) => {
    const [user] = await client_1.db
        .select({ id: users_1.users.id, role: users_1.users.role })
        .from(users_1.users)
        .where((0, drizzle_orm_1.eq)(users_1.users.id, userId))
        .limit(1);
    if (!user)
        return null;
    if (user.role === 'admin') {
        return {
            userId,
            actorType: 'admin',
            staffId: null,
            roleId: null,
            roleCode: 'super_admin',
            roleName: 'Super Admin',
            scopeType: 'all',
            permissions: {},
        };
    }
    if (user.role !== 'admin_staff')
        return null;
    const [row] = await client_1.db
        .select({
        staffId: adminCrm_1.adminStaff.id,
        roleId: adminCrm_1.adminStaff.roleId,
        scopeType: adminCrm_1.adminStaff.scopeType,
        permissionOverrides: adminCrm_1.adminStaff.permissionOverrides,
        roleCode: adminCrm_1.adminRoles.code,
        roleName: adminCrm_1.adminRoles.name,
        rolePermissions: adminCrm_1.adminRoles.permissions,
    })
        .from(adminCrm_1.adminStaff)
        .innerJoin(adminCrm_1.adminRoles, (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, adminCrm_1.adminStaff.roleId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.userId, userId), (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, true), (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.isActive, true)))
        .limit(1);
    if (!row)
        return null;
    return {
        userId,
        actorType: 'staff',
        staffId: row.staffId,
        roleId: row.roleId,
        roleCode: row.roleCode,
        roleName: row.roleName,
        scopeType: ['assigned', 'team', 'all'].includes(row.scopeType)
            ? row.scopeType
            : 'assigned',
        permissions: (0, exports.mergePermissions)(row.rolePermissions, row.permissionOverrides),
    };
};
exports.resolveAdminAccess = resolveAdminAccess;
const inferAdminModule = (baseUrl, path) => {
    const source = `${baseUrl}${path}`.toLowerCase();
    if (source.includes('/manual-couriers'))
        return 'manualCouriers';
    if (source.includes('/weight-reconciliation'))
        return 'disputes';
    if (source.includes('/cod-remittance'))
        return 'cod';
    if (source.includes('/wallet'))
        return 'wallet';
    if (source.includes('/billing'))
        return 'billing';
    if (source.includes('/support-ticket'))
        return 'support';
    if (source.includes('/orders'))
        return 'orders';
    if (source.includes('/users') && source.includes('/kyc'))
        return 'kyc';
    if (source.includes('/users'))
        return 'sellers';
    if (source.includes('/franchise'))
        return 'franchise';
    if (source.includes('/courier') || source.includes('/zone') || source.includes('/b2b')) {
        return 'shipping';
    }
    if (source.includes('/developer'))
        return 'developer';
    return 'admin';
};
exports.inferAdminModule = inferAdminModule;
const inferRequiredLevel = (method, baseUrl, path) => {
    const source = `${baseUrl}${path}`.toLowerCase();
    if (method.toUpperCase() === 'GET' || source.includes('/shipment-reports'))
        return 'view';
    if (source.includes('/approve') ||
        source.includes('/reject') ||
        source.includes('/adjust') ||
        source.includes('/settle')) {
        return 'approve';
    }
    if (source.includes('/credentials') ||
        source.includes('/roles') ||
        source.includes('/employees')) {
        return 'manage';
    }
    return 'operate';
};
exports.inferRequiredLevel = inferRequiredLevel;
