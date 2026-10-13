"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamPerformance = exports.getCrmDashboard = exports.listCrmActivities = exports.addCrmActivity = exports.updateCrmTask = exports.createCrmTask = exports.listCrmTasks = exports.endAssignment = exports.listAssignments = exports.assignSeller = exports.getCrmSellerOrders = exports.getCrmSellerDetail = exports.listCrmSellers = exports.updateAdminStaff = exports.createAdminStaff = exports.listAdminStaff = exports.updateAdminRole = exports.createAdminRole = exports.listAdminRoles = exports.getAdminCrmSession = exports.assertSellerAccess = exports.getAccessibleSellerIds = exports.getAccessibleStaffIds = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const emailSender_1 = require("../../utils/emailSender");
const adminAccess_1 = require("../../utils/adminAccess");
const classes_1 = require("../../utils/classes");
const client_1 = require("../client");
const adminCrm_1 = require("../schema/adminCrm");
const supportTickets_1 = require("../schema/supportTickets");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const wallet_1 = require("../schema/wallet");
const adminOrders_service_1 = require("./adminOrders.service");
const ROLE_CODE = /^[a-z][a-z0-9_]{2,63}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCOPE_TYPES = new Set(['assigned', 'team', 'all']);
const ASSIGNMENT_TYPES = new Set(['primary', 'support']);
const TASK_STATUSES = new Set(['open', 'in_progress', 'completed', 'cancelled', 'escalated']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const text = (value) => String(value ?? '').trim();
const nullableText = (value) => text(value) || null;
const asDate = (value) => {
    if (!value)
        return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()))
        throw new classes_1.HttpError(400, 'Invalid date value');
    return date;
};
const pageValues = (input, defaultLimit = 20) => ({
    page: Math.max(1, Number(input?.page || 1)),
    limit: Math.min(100, Math.max(1, Number(input?.limit || defaultLimit))),
});
const normalizePermissions = (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return {};
    return Object.fromEntries(Object.entries(input)
        .map(([module, level]) => [text(module), text(level)])
        .filter(([module, level]) => module && adminAccess_1.ADMIN_PERMISSION_LEVELS.includes(level)));
};
const requirePermission = (access, module, level) => {
    if (!(0, adminAccess_1.hasAdminPermission)(access, module, level)) {
        throw new classes_1.HttpError(403, `Permission required: ${module}.${level}`);
    }
};
const getAccessibleStaffIds = async (access) => {
    if (access.actorType === 'admin' || access.scopeType === 'all')
        return null;
    if (!access.staffId)
        return [];
    if (access.scopeType === 'assigned')
        return [access.staffId];
    const reports = await client_1.db
        .select({ id: adminCrm_1.adminStaff.id })
        .from(adminCrm_1.adminStaff)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.managerStaffId, access.staffId), (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, true)));
    return [access.staffId, ...reports.map((row) => row.id)];
};
exports.getAccessibleStaffIds = getAccessibleStaffIds;
const getAccessibleSellerIds = async (access) => {
    const staffIds = await (0, exports.getAccessibleStaffIds)(access);
    if (staffIds === null)
        return null;
    if (!staffIds.length)
        return [];
    const assignments = await client_1.db
        .select({ sellerId: adminCrm_1.sellerAssignments.sellerId })
        .from(adminCrm_1.sellerAssignments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(adminCrm_1.sellerAssignments.staffId, staffIds), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)));
    return Array.from(new Set(assignments.map((row) => row.sellerId)));
};
exports.getAccessibleSellerIds = getAccessibleSellerIds;
const assertSellerAccess = async (access, sellerId) => {
    requirePermission(access, 'sellers', 'view');
    const sellerIds = await (0, exports.getAccessibleSellerIds)(access);
    if (sellerIds !== null && !sellerIds.includes(sellerId)) {
        throw new classes_1.HttpError(403, 'This seller is outside your assigned scope');
    }
    const [seller] = await client_1.db
        .select({ id: users_1.users.id })
        .from(users_1.users)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.users.id, sellerId), (0, drizzle_orm_1.eq)(users_1.users.role, 'customer')))
        .limit(1);
    if (!seller)
        throw new classes_1.HttpError(404, 'Seller not found');
};
exports.assertSellerAccess = assertSellerAccess;
const getAdminCrmSession = async (access) => {
    if (access.actorType === 'admin')
        return access;
    const [staff] = await client_1.db
        .select({
        id: adminCrm_1.adminStaff.id,
        name: adminCrm_1.adminStaff.name,
        department: adminCrm_1.adminStaff.department,
        designation: adminCrm_1.adminStaff.designation,
        employeeCode: adminCrm_1.adminStaff.employeeCode,
        managerStaffId: adminCrm_1.adminStaff.managerStaffId,
        isActive: adminCrm_1.adminStaff.isActive,
    })
        .from(adminCrm_1.adminStaff)
        .where((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, access.staffId))
        .limit(1);
    return { ...access, staff };
};
exports.getAdminCrmSession = getAdminCrmSession;
const listAdminRoles = async () => client_1.db.select().from(adminCrm_1.adminRoles).orderBy((0, drizzle_orm_1.desc)(adminCrm_1.adminRoles.isSystem), (0, drizzle_orm_1.asc)(adminCrm_1.adminRoles.name));
exports.listAdminRoles = listAdminRoles;
const createAdminRole = async (input, actorId) => {
    const code = text(input.code).toLowerCase().replace(/[\s-]+/g, '_');
    const name = text(input.name);
    if (!ROLE_CODE.test(code))
        throw new classes_1.HttpError(400, 'Role code must use lowercase letters, numbers and underscores');
    if (!name)
        throw new classes_1.HttpError(400, 'Role name is required');
    const [created] = await client_1.db
        .insert(adminCrm_1.adminRoles)
        .values({
        code,
        name,
        description: nullableText(input.description),
        permissions: normalizePermissions(input.permissions),
        isSystem: false,
        isActive: input.isActive !== false,
        createdBy: actorId,
    })
        .returning();
    return created;
};
exports.createAdminRole = createAdminRole;
const updateAdminRole = async (id, input) => {
    const [current] = await client_1.db.select().from(adminCrm_1.adminRoles).where((0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, id)).limit(1);
    if (!current)
        throw new classes_1.HttpError(404, 'Role not found');
    const [updated] = await client_1.db
        .update(adminCrm_1.adminRoles)
        .set({
        name: text(input.name) || current.name,
        description: input.description === undefined ? current.description : nullableText(input.description),
        permissions: input.permissions === undefined
            ? current.permissions
            : normalizePermissions(input.permissions),
        isActive: typeof input.isActive === 'boolean' ? input.isActive : current.isActive,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, id))
        .returning();
    return updated;
};
exports.updateAdminRole = updateAdminRole;
const listAdminStaff = async (input, access) => {
    const { page, limit } = pageValues(input);
    const conditions = [];
    if (access) {
        const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
        if (allowedStaffIds !== null) {
            if (!allowedStaffIds.length)
                return { data: [], totalCount: 0, page, limit };
            conditions.push((0, drizzle_orm_1.inArray)(adminCrm_1.adminStaff.id, allowedStaffIds));
        }
    }
    const search = text(input.search);
    if (search) {
        const term = `%${search}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(adminCrm_1.adminStaff.name, term), (0, drizzle_orm_1.ilike)(users_1.users.email, term), (0, drizzle_orm_1.ilike)(adminCrm_1.adminStaff.employeeCode, term), (0, drizzle_orm_1.ilike)(adminCrm_1.adminStaff.department, term)));
    }
    if (input.status === 'active')
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, true));
    if (input.status === 'inactive')
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, false));
    if (input.roleId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.roleId, text(input.roleId)));
    const where = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    const rows = await client_1.db
        .select({
        id: adminCrm_1.adminStaff.id,
        userId: adminCrm_1.adminStaff.userId,
        employeeCode: adminCrm_1.adminStaff.employeeCode,
        name: adminCrm_1.adminStaff.name,
        email: users_1.users.email,
        phone: adminCrm_1.adminStaff.phone,
        department: adminCrm_1.adminStaff.department,
        designation: adminCrm_1.adminStaff.designation,
        roleId: adminCrm_1.adminStaff.roleId,
        roleName: adminCrm_1.adminRoles.name,
        roleCode: adminCrm_1.adminRoles.code,
        managerStaffId: adminCrm_1.adminStaff.managerStaffId,
        scopeType: adminCrm_1.adminStaff.scopeType,
        permissionOverrides: adminCrm_1.adminStaff.permissionOverrides,
        isActive: adminCrm_1.adminStaff.isActive,
        lastLoginAt: adminCrm_1.adminStaff.lastLoginAt,
        createdAt: adminCrm_1.adminStaff.createdAt,
        assignedSellerCount: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_seller_assignments sa
        where sa.staff_id = ${adminCrm_1.adminStaff.id} and sa.is_active = true
      )`,
        openTaskCount: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminCrm_1.adminStaff.id}
          and ct.status in ('open', 'in_progress', 'escalated')
      )`,
    })
        .from(adminCrm_1.adminStaff)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, adminCrm_1.adminStaff.userId))
        .innerJoin(adminCrm_1.adminRoles, (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, adminCrm_1.adminStaff.roleId))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(adminCrm_1.adminStaff.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(adminCrm_1.adminStaff)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, adminCrm_1.adminStaff.userId))
        .where(where);
    return { data: rows, totalCount: Number(count || 0), page, limit };
};
exports.listAdminStaff = listAdminStaff;
const createAdminStaff = async (input, actorId) => {
    const email = text(input.email).toLowerCase();
    const name = text(input.name);
    const password = text(input.password);
    const roleId = text(input.roleId);
    if (!name || !EMAIL.test(email))
        throw new classes_1.HttpError(400, 'Valid name and email are required');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        throw new classes_1.HttpError(400, 'Password must be at least 8 characters with upper, lower and number');
    }
    if (!roleId)
        throw new classes_1.HttpError(400, 'Role is required');
    const scopeType = SCOPE_TYPES.has(text(input.scopeType)) ? text(input.scopeType) : 'assigned';
    const created = await client_1.db.transaction(async (tx) => {
        const [role] = await tx
            .select({ id: adminCrm_1.adminRoles.id })
            .from(adminCrm_1.adminRoles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, roleId), (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.isActive, true)))
            .limit(1);
        if (!role)
            throw new classes_1.HttpError(400, 'Select an active role');
        const [existing] = await tx.select({ id: users_1.users.id }).from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.email, email)).limit(1);
        if (existing)
            throw new classes_1.HttpError(409, 'An account with this email already exists');
        if (input.managerStaffId) {
            const [manager] = await tx
                .select({ id: adminCrm_1.adminStaff.id })
                .from(adminCrm_1.adminStaff)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, text(input.managerStaffId)), (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, true)))
                .limit(1);
            if (!manager)
                throw new classes_1.HttpError(400, 'Manager not found or inactive');
        }
        const [user] = await tx
            .insert(users_1.users)
            .values({
            email,
            phone: nullableText(input.phone),
            passwordHash: await bcryptjs_1.default.hash(password, 10),
            role: 'admin_staff',
            accountVerified: true,
            emailVerified: true,
            phoneVerified: Boolean(nullableText(input.phone)),
        })
            .returning();
        const [staff] = await tx
            .insert(adminCrm_1.adminStaff)
            .values({
            userId: user.id,
            roleId,
            managerStaffId: nullableText(input.managerStaffId),
            employeeCode: nullableText(input.employeeCode),
            name,
            phone: nullableText(input.phone),
            department: text(input.department) || 'Relationship Management',
            designation: text(input.designation) || 'Executive',
            scopeType,
            permissionOverrides: normalizePermissions(input.permissionOverrides),
            isActive: input.isActive !== false,
            createdBy: actorId,
        })
            .returning();
        return { user, staff };
    });
    (0, emailSender_1.sendEmployeeCredentials)(email, email, password, 'Shipray Administration').catch((error) => console.error('[AdminCRM] Failed to send staff credentials:', error));
    return created;
};
exports.createAdminStaff = createAdminStaff;
const updateAdminStaff = async (id, input, actorId) => client_1.db.transaction(async (tx) => {
    const [current] = await tx.select().from(adminCrm_1.adminStaff).where((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, id)).limit(1);
    if (!current)
        throw new classes_1.HttpError(404, 'Employee not found');
    if (text(input.managerStaffId) === id)
        throw new classes_1.HttpError(400, 'Employee cannot manage themselves');
    if (input.roleId) {
        const [role] = await tx
            .select({ id: adminCrm_1.adminRoles.id })
            .from(adminCrm_1.adminRoles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, text(input.roleId)), (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.isActive, true)))
            .limit(1);
        if (!role)
            throw new classes_1.HttpError(400, 'Select an active role');
    }
    const becomingInactive = current.isActive && input.isActive === false;
    const password = text(input.password);
    if (password && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))) {
        throw new classes_1.HttpError(400, 'Password must be at least 8 characters with upper, lower and number');
    }
    const [updated] = await tx
        .update(adminCrm_1.adminStaff)
        .set({
        roleId: text(input.roleId) || current.roleId,
        managerStaffId: input.managerStaffId === undefined ? current.managerStaffId : nullableText(input.managerStaffId),
        employeeCode: input.employeeCode === undefined ? current.employeeCode : nullableText(input.employeeCode),
        name: text(input.name) || current.name,
        phone: input.phone === undefined ? current.phone : nullableText(input.phone),
        department: text(input.department) || current.department,
        designation: text(input.designation) || current.designation,
        scopeType: SCOPE_TYPES.has(text(input.scopeType)) ? text(input.scopeType) : current.scopeType,
        permissionOverrides: input.permissionOverrides === undefined
            ? current.permissionOverrides
            : normalizePermissions(input.permissionOverrides),
        isActive: typeof input.isActive === 'boolean' ? input.isActive : current.isActive,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, id))
        .returning();
    if (password || becomingInactive) {
        await tx
            .update(users_1.users)
            .set({
            ...(password ? { passwordHash: await bcryptjs_1.default.hash(password, 10) } : {}),
            ...(becomingInactive
                ? {
                    refreshToken: null,
                    refreshTokenExpiresAt: null,
                    previousRefreshToken: null,
                    previousRefreshTokenExpiresAt: null,
                }
                : {}),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, current.userId));
    }
    if (becomingInactive) {
        await tx
            .update(adminCrm_1.sellerAssignments)
            .set({ isActive: false, endedAt: new Date(), reason: 'Employee deactivated' })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.staffId, id), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)));
        await tx
            .update(adminCrm_1.crmTasks)
            .set({ assignedStaffId: null, status: (0, drizzle_orm_1.sql) `case when status = 'completed' then status else 'escalated' end`, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.assignedStaffId, id));
    }
    const [portfolioSeller] = await tx
        .select({ sellerId: adminCrm_1.sellerAssignments.sellerId })
        .from(adminCrm_1.sellerAssignments)
        .where((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.staffId, id))
        .orderBy((0, drizzle_orm_1.desc)(adminCrm_1.sellerAssignments.assignedAt))
        .limit(1);
    if (portfolioSeller) {
        await tx.insert(adminCrm_1.crmActivities).values({
            sellerId: portfolioSeller.sellerId,
            staffId: id,
            activityType: 'employee_updated',
            summary: becomingInactive
                ? 'Employee deactivated and portfolio released'
                : 'Employee access updated',
            metadata: { actorId },
            createdBy: actorId,
        });
    }
    return updated;
});
exports.updateAdminStaff = updateAdminStaff;
const listCrmSellers = async (access, input) => {
    requirePermission(access, 'sellers', 'view');
    const { page, limit } = pageValues(input);
    const allowedIds = await (0, exports.getAccessibleSellerIds)(access);
    if (allowedIds !== null && !allowedIds.length)
        return { data: [], totalCount: 0, page, limit };
    const conditions = [(0, drizzle_orm_1.eq)(users_1.users.role, 'customer')];
    if (allowedIds !== null)
        conditions.push((0, drizzle_orm_1.inArray)(users_1.users.id, allowedIds));
    const search = text(input.search);
    if (search) {
        const term = `%${search}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(users_1.users.email, term), (0, drizzle_orm_1.ilike)(users_1.users.phone, term), (0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo}->>'companyName', '') ilike ${term}`, (0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo}->>'contactPerson', '') ilike ${term}`));
    }
    if (input.assignment === 'unassigned') {
        conditions.push((0, drizzle_orm_1.sql) `not exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = ${users_1.users.id} and sa.assignment_type = 'primary' and sa.is_active = true
    )`);
    }
    if (input.staffId) {
        conditions.push((0, drizzle_orm_1.sql) `exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = ${users_1.users.id} and sa.staff_id = ${text(input.staffId)} and sa.is_active = true
    )`);
    }
    const where = (0, drizzle_orm_1.and)(...conditions);
    const selection = {
        id: users_1.users.id,
        email: users_1.users.email,
        phone: users_1.users.phone,
        createdAt: users_1.users.createdAt,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        businessType: userProfile_1.userProfiles.businessType,
        approved: userProfile_1.userProfiles.approved,
        onboardingComplete: userProfile_1.userProfiles.onboardingComplete,
        domesticKyc: userProfile_1.userProfiles.domesticKyc,
        walletBalance: wallet_1.wallets.balance,
        primaryStaffId: (0, drizzle_orm_1.sql) `(
      select sa.staff_id from shipray_seller_assignments sa
      where sa.seller_id = ${users_1.users.id} and sa.assignment_type = 'primary' and sa.is_active = true
      limit 1
    )`,
        primaryStaffName: (0, drizzle_orm_1.sql) `(
      select ast.name from shipray_seller_assignments sa
      join shipray_admin_staff ast on ast.id = sa.staff_id
      where sa.seller_id = ${users_1.users.id} and sa.assignment_type = 'primary' and sa.is_active = true
      limit 1
    )`,
        orderCount: (0, drizzle_orm_1.sql) `(
      (select count(*) from b2c_orders bo where bo.user_id = ${users_1.users.id}) +
      (select count(*) from b2b_orders bo where bo.user_id = ${users_1.users.id})
    )::int`,
        openTaskCount: (0, drizzle_orm_1.sql) `(
      select count(*)::int from shipray_crm_tasks ct
      where ct.seller_id = ${users_1.users.id} and ct.status in ('open', 'in_progress', 'escalated')
    )`,
    };
    const rows = await client_1.db
        .select(selection)
        .from(users_1.users)
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .leftJoin(wallet_1.wallets, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(users_1.users.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(users_1.users)
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .where(where);
    return { data: rows, totalCount: Number(count || 0), page, limit };
};
exports.listCrmSellers = listCrmSellers;
const getCrmSellerDetail = async (access, sellerId) => {
    await (0, exports.assertSellerAccess)(access, sellerId);
    const [seller] = await client_1.db
        .select({
        id: users_1.users.id,
        email: users_1.users.email,
        phone: users_1.users.phone,
        createdAt: users_1.users.createdAt,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        businessType: userProfile_1.userProfiles.businessType,
        approved: userProfile_1.userProfiles.approved,
        onboardingComplete: userProfile_1.userProfiles.onboardingComplete,
        domesticKyc: userProfile_1.userProfiles.domesticKyc,
        gstDetails: userProfile_1.userProfiles.gstDetails,
        walletBalance: wallet_1.wallets.balance,
    })
        .from(users_1.users)
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .leftJoin(wallet_1.wallets, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .where((0, drizzle_orm_1.eq)(users_1.users.id, sellerId))
        .limit(1);
    const orderStatsResult = await client_1.db.execute((0, drizzle_orm_1.sql) `
    select
      count(*)::int as total,
      count(*) filter (where order_status = 'delivered')::int as delivered,
      count(*) filter (where order_status in ('ndr','undelivered'))::int as ndr,
      count(*) filter (where order_status like 'rto%')::int as rto,
      count(*) filter (where created_at >= now() - interval '30 days')::int as last_30_days
    from (
      select order_status, created_at from b2c_orders where user_id = ${sellerId}
      union all
      select order_status, created_at from b2b_orders where user_id = ${sellerId}
    ) orders
  `);
    const assignments = await client_1.db
        .select({
        id: adminCrm_1.sellerAssignments.id,
        staffId: adminCrm_1.sellerAssignments.staffId,
        staffName: adminCrm_1.adminStaff.name,
        assignmentType: adminCrm_1.sellerAssignments.assignmentType,
        assignedAt: adminCrm_1.sellerAssignments.assignedAt,
    })
        .from(adminCrm_1.sellerAssignments)
        .innerJoin(adminCrm_1.adminStaff, (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, adminCrm_1.sellerAssignments.staffId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.sellerId, sellerId), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)));
    const [openTickets] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(supportTickets_1.supportTickets)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, sellerId), (0, drizzle_orm_1.inArray)(supportTickets_1.supportTickets.status, ['open', 'in_progress'])));
    return {
        seller,
        assignments,
        orderStats: orderStatsResult?.rows?.[0] || orderStatsResult?.[0] || {},
        openTickets: Number(openTickets?.count || 0),
    };
};
exports.getCrmSellerDetail = getCrmSellerDetail;
const getCrmSellerOrders = async (access, sellerId, input) => {
    await (0, exports.assertSellerAccess)(access, sellerId);
    requirePermission(access, 'orders', 'view');
    const { page, limit } = pageValues(input, 10);
    return (0, adminOrders_service_1.getAllOrdersServiceAdmin)({
        page,
        limit,
        filters: {
            userId: sellerId,
            status: text(input.status) || undefined,
            search: text(input.search) || undefined,
            sortOrder: 'desc',
        },
    });
};
exports.getCrmSellerOrders = getCrmSellerOrders;
const assignSeller = async (access, input, actorId) => {
    requirePermission(access, 'assignments', 'manage');
    const sellerId = text(input.sellerId);
    const staffId = text(input.staffId);
    const assignmentType = ASSIGNMENT_TYPES.has(text(input.assignmentType))
        ? text(input.assignmentType)
        : 'primary';
    if (!sellerId || !staffId)
        throw new classes_1.HttpError(400, 'Seller and employee are required');
    if (access.actorType === 'staff' && access.scopeType !== 'all') {
        const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
        if (!allowedStaffIds?.includes(staffId)) {
            throw new classes_1.HttpError(403, 'Employee is outside your team scope');
        }
        await (0, exports.assertSellerAccess)(access, sellerId);
    }
    return client_1.db.transaction(async (tx) => {
        const [seller] = await tx
            .select({ id: users_1.users.id })
            .from(users_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.users.id, sellerId), (0, drizzle_orm_1.eq)(users_1.users.role, 'customer')))
            .limit(1);
        if (!seller)
            throw new classes_1.HttpError(404, 'Seller not found');
        const [staff] = await tx
            .select({ id: adminCrm_1.adminStaff.id, name: adminCrm_1.adminStaff.name })
            .from(adminCrm_1.adminStaff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, staffId), (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.isActive, true)))
            .limit(1);
        if (!staff)
            throw new classes_1.HttpError(400, 'Employee not found or inactive');
        await tx.execute((0, drizzle_orm_1.sql) `select id from users where id = ${sellerId} for update`);
        if (assignmentType === 'primary') {
            await tx
                .update(adminCrm_1.sellerAssignments)
                .set({ isActive: false, endedAt: new Date(), reason: nullableText(input.reason) || 'Reassigned' })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.sellerId, sellerId), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.assignmentType, 'primary'), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)));
        }
        const [existing] = await tx
            .select()
            .from(adminCrm_1.sellerAssignments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.sellerId, sellerId), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.staffId, staffId), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.assignmentType, assignmentType), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)))
            .limit(1);
        const assignment = existing || (await tx
            .insert(adminCrm_1.sellerAssignments)
            .values({
            sellerId,
            staffId,
            assignmentType,
            reason: nullableText(input.reason),
            assignedBy: actorId,
        })
            .returning())[0];
        await tx.insert(adminCrm_1.crmActivities).values({
            sellerId,
            staffId,
            activityType: assignmentType === 'primary' ? 'seller_assigned' : 'support_assigned',
            summary: `${staff.name} assigned as ${assignmentType} owner`,
            notes: nullableText(input.reason),
            metadata: { assignmentId: assignment.id },
            createdBy: actorId,
        });
        return assignment;
    });
};
exports.assignSeller = assignSeller;
const listAssignments = async (input, access) => {
    const { page, limit } = pageValues(input);
    const conditions = [(0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)];
    if (access) {
        const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
        if (allowedStaffIds !== null) {
            if (!allowedStaffIds.length)
                return { data: [], totalCount: 0, page, limit };
            conditions.push((0, drizzle_orm_1.inArray)(adminCrm_1.sellerAssignments.staffId, allowedStaffIds));
        }
    }
    if (input.staffId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.staffId, text(input.staffId)));
    if (input.assignmentType) {
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.assignmentType, text(input.assignmentType)));
    }
    const where = (0, drizzle_orm_1.and)(...conditions);
    const rows = await client_1.db
        .select({
        id: adminCrm_1.sellerAssignments.id,
        sellerId: adminCrm_1.sellerAssignments.sellerId,
        sellerEmail: users_1.users.email,
        sellerPhone: users_1.users.phone,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        staffId: adminCrm_1.sellerAssignments.staffId,
        staffName: adminCrm_1.adminStaff.name,
        assignmentType: adminCrm_1.sellerAssignments.assignmentType,
        reason: adminCrm_1.sellerAssignments.reason,
        assignedAt: adminCrm_1.sellerAssignments.assignedAt,
    })
        .from(adminCrm_1.sellerAssignments)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, adminCrm_1.sellerAssignments.sellerId))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .innerJoin(adminCrm_1.adminStaff, (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, adminCrm_1.sellerAssignments.staffId))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(adminCrm_1.sellerAssignments.assignedAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(adminCrm_1.sellerAssignments)
        .where(where);
    return { data: rows, totalCount: Number(count || 0), page, limit };
};
exports.listAssignments = listAssignments;
const endAssignment = async (access, id, actorId, reason) => {
    const [current] = await client_1.db
        .select({ staffId: adminCrm_1.sellerAssignments.staffId })
        .from(adminCrm_1.sellerAssignments)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.id, id), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)))
        .limit(1);
    if (!current)
        throw new classes_1.HttpError(404, 'Active assignment not found');
    const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
    if (allowedStaffIds !== null && !allowedStaffIds.includes(current.staffId)) {
        throw new classes_1.HttpError(403, 'Assignment is outside your team scope');
    }
    return client_1.db.transaction(async (tx) => {
        const [assignment] = await tx
            .update(adminCrm_1.sellerAssignments)
            .set({ isActive: false, endedAt: new Date(), reason: nullableText(reason) || 'Assignment ended' })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.id, id), (0, drizzle_orm_1.eq)(adminCrm_1.sellerAssignments.isActive, true)))
            .returning();
        if (!assignment)
            throw new classes_1.HttpError(404, 'Active assignment not found');
        await tx.insert(adminCrm_1.crmActivities).values({
            sellerId: assignment.sellerId,
            staffId: assignment.staffId,
            activityType: 'assignment_ended',
            summary: 'Seller assignment ended',
            notes: nullableText(reason),
            createdBy: actorId,
        });
        return assignment;
    });
};
exports.endAssignment = endAssignment;
const listCrmTasks = async (access, input) => {
    requirePermission(access, 'crm', 'view');
    const { page, limit } = pageValues(input);
    const allowedSellerIds = await (0, exports.getAccessibleSellerIds)(access);
    if (allowedSellerIds !== null && !allowedSellerIds.length) {
        return { data: [], totalCount: 0, page, limit };
    }
    const conditions = [];
    if (allowedSellerIds !== null)
        conditions.push((0, drizzle_orm_1.inArray)(adminCrm_1.crmTasks.sellerId, allowedSellerIds));
    if (input.status)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.status, text(input.status)));
    if (input.staffId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.assignedStaffId, text(input.staffId)));
    if (input.sellerId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.sellerId, text(input.sellerId)));
    if (input.due === 'overdue') {
        conditions.push((0, drizzle_orm_1.sql) `${adminCrm_1.crmTasks.dueAt} < now() and ${adminCrm_1.crmTasks.status} not in ('completed','cancelled')`);
    }
    if (input.due === 'today') {
        conditions.push((0, drizzle_orm_1.sql) `${adminCrm_1.crmTasks.dueAt} >= current_date and ${adminCrm_1.crmTasks.dueAt} < current_date + interval '1 day'`);
    }
    const where = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    const rows = await client_1.db
        .select({
        id: adminCrm_1.crmTasks.id,
        sellerId: adminCrm_1.crmTasks.sellerId,
        sellerEmail: users_1.users.email,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        assignedStaffId: adminCrm_1.crmTasks.assignedStaffId,
        assignedStaffName: adminCrm_1.adminStaff.name,
        category: adminCrm_1.crmTasks.category,
        title: adminCrm_1.crmTasks.title,
        description: adminCrm_1.crmTasks.description,
        priority: adminCrm_1.crmTasks.priority,
        status: adminCrm_1.crmTasks.status,
        dueAt: adminCrm_1.crmTasks.dueAt,
        completedAt: adminCrm_1.crmTasks.completedAt,
        outcome: adminCrm_1.crmTasks.outcome,
        nextFollowUpAt: adminCrm_1.crmTasks.nextFollowUpAt,
        createdAt: adminCrm_1.crmTasks.createdAt,
    })
        .from(adminCrm_1.crmTasks)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, adminCrm_1.crmTasks.sellerId))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .leftJoin(adminCrm_1.adminStaff, (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, adminCrm_1.crmTasks.assignedStaffId))
        .where(where)
        .orderBy((0, drizzle_orm_1.asc)((0, drizzle_orm_1.sql) `case when ${adminCrm_1.crmTasks.dueAt} is null then 1 else 0 end`), (0, drizzle_orm_1.asc)(adminCrm_1.crmTasks.dueAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(adminCrm_1.crmTasks)
        .where(where);
    return { data: rows, totalCount: Number(count || 0), page, limit };
};
exports.listCrmTasks = listCrmTasks;
const createCrmTask = async (access, input, actorId) => {
    requirePermission(access, 'crm', 'operate');
    const sellerId = text(input.sellerId);
    await (0, exports.assertSellerAccess)(access, sellerId);
    const title = text(input.title);
    if (!title)
        throw new classes_1.HttpError(400, 'Task title is required');
    const assignedStaffId = nullableText(input.assignedStaffId) || access.staffId;
    if (assignedStaffId) {
        const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
        if (allowedStaffIds !== null && !allowedStaffIds.includes(assignedStaffId)) {
            throw new classes_1.HttpError(403, 'Task assignee is outside your team scope');
        }
    }
    const [created] = await client_1.db
        .insert(adminCrm_1.crmTasks)
        .values({
        sellerId,
        assignedStaffId,
        category: text(input.category) || 'follow_up',
        title,
        description: nullableText(input.description),
        priority: TASK_PRIORITIES.has(text(input.priority)) ? text(input.priority) : 'medium',
        status: 'open',
        dueAt: asDate(input.dueAt),
        nextFollowUpAt: asDate(input.nextFollowUpAt),
        createdBy: actorId,
    })
        .returning();
    await client_1.db.insert(adminCrm_1.crmActivities).values({
        sellerId,
        staffId: assignedStaffId,
        taskId: created.id,
        activityType: 'task_created',
        summary: `Task created: ${title}`,
        notes: nullableText(input.description),
        createdBy: actorId,
    });
    return created;
};
exports.createCrmTask = createCrmTask;
const updateCrmTask = async (access, id, input, actorId) => {
    requirePermission(access, 'crm', 'operate');
    const [current] = await client_1.db.select().from(adminCrm_1.crmTasks).where((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.id, id)).limit(1);
    if (!current)
        throw new classes_1.HttpError(404, 'CRM task not found');
    await (0, exports.assertSellerAccess)(access, current.sellerId);
    const requestedStaffId = input.assignedStaffId === undefined ? current.assignedStaffId : nullableText(input.assignedStaffId);
    if (requestedStaffId) {
        const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
        if (allowedStaffIds !== null && !allowedStaffIds.includes(requestedStaffId)) {
            throw new classes_1.HttpError(403, 'Task assignee is outside your team scope');
        }
    }
    const status = TASK_STATUSES.has(text(input.status)) ? text(input.status) : current.status;
    const [updated] = await client_1.db
        .update(adminCrm_1.crmTasks)
        .set({
        assignedStaffId: requestedStaffId,
        category: text(input.category) || current.category,
        title: text(input.title) || current.title,
        description: input.description === undefined ? current.description : nullableText(input.description),
        priority: TASK_PRIORITIES.has(text(input.priority)) ? text(input.priority) : current.priority,
        status,
        dueAt: input.dueAt === undefined ? current.dueAt : asDate(input.dueAt),
        completedAt: status === 'completed' ? new Date() : status !== current.status ? null : current.completedAt,
        outcome: input.outcome === undefined ? current.outcome : nullableText(input.outcome),
        nextFollowUpAt: input.nextFollowUpAt === undefined ? current.nextFollowUpAt : asDate(input.nextFollowUpAt),
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(adminCrm_1.crmTasks.id, id))
        .returning();
    await client_1.db.insert(adminCrm_1.crmActivities).values({
        sellerId: current.sellerId,
        staffId: updated.assignedStaffId,
        taskId: id,
        activityType: status === 'completed' ? 'task_completed' : 'task_updated',
        summary: status === 'completed' ? `Task completed: ${updated.title}` : `Task updated: ${updated.title}`,
        notes: nullableText(input.outcome),
        metadata: { previousStatus: current.status, status },
        createdBy: actorId,
    });
    return updated;
};
exports.updateCrmTask = updateCrmTask;
const addCrmActivity = async (access, input, actorId) => {
    requirePermission(access, 'crm', 'operate');
    const sellerId = text(input.sellerId);
    await (0, exports.assertSellerAccess)(access, sellerId);
    const summary = text(input.summary);
    if (!summary)
        throw new classes_1.HttpError(400, 'Activity summary is required');
    const [created] = await client_1.db
        .insert(adminCrm_1.crmActivities)
        .values({
        sellerId,
        staffId: access.staffId || nullableText(input.staffId),
        activityType: text(input.activityType) || 'note',
        summary,
        notes: nullableText(input.notes),
        metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
        occurredAt: asDate(input.occurredAt) || new Date(),
        createdBy: actorId,
    })
        .returning();
    return created;
};
exports.addCrmActivity = addCrmActivity;
const listCrmActivities = async (access, input) => {
    requirePermission(access, 'crm', 'view');
    const { page, limit } = pageValues(input);
    const allowedSellerIds = await (0, exports.getAccessibleSellerIds)(access);
    if (allowedSellerIds !== null && !allowedSellerIds.length) {
        return { data: [], totalCount: 0, page, limit };
    }
    const conditions = [];
    if (allowedSellerIds !== null)
        conditions.push((0, drizzle_orm_1.inArray)(adminCrm_1.crmActivities.sellerId, allowedSellerIds));
    if (input.sellerId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmActivities.sellerId, text(input.sellerId)));
    if (input.staffId)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmActivities.staffId, text(input.staffId)));
    if (input.activityType)
        conditions.push((0, drizzle_orm_1.eq)(adminCrm_1.crmActivities.activityType, text(input.activityType)));
    const where = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    const rows = await client_1.db
        .select({
        id: adminCrm_1.crmActivities.id,
        sellerId: adminCrm_1.crmActivities.sellerId,
        sellerEmail: users_1.users.email,
        companyInfo: userProfile_1.userProfiles.companyInfo,
        staffId: adminCrm_1.crmActivities.staffId,
        staffName: adminCrm_1.adminStaff.name,
        taskId: adminCrm_1.crmActivities.taskId,
        activityType: adminCrm_1.crmActivities.activityType,
        summary: adminCrm_1.crmActivities.summary,
        notes: adminCrm_1.crmActivities.notes,
        metadata: adminCrm_1.crmActivities.metadata,
        occurredAt: adminCrm_1.crmActivities.occurredAt,
        createdAt: adminCrm_1.crmActivities.createdAt,
    })
        .from(adminCrm_1.crmActivities)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, adminCrm_1.crmActivities.sellerId))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .leftJoin(adminCrm_1.adminStaff, (0, drizzle_orm_1.eq)(adminCrm_1.adminStaff.id, adminCrm_1.crmActivities.staffId))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(adminCrm_1.crmActivities.occurredAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(adminCrm_1.crmActivities)
        .where(where);
    return { data: rows, totalCount: Number(count || 0), page, limit };
};
exports.listCrmActivities = listCrmActivities;
const getCrmDashboard = async (access) => {
    requirePermission(access, 'crm', 'view');
    const allowedSellerIds = await (0, exports.getAccessibleSellerIds)(access);
    const sellerScope = allowedSellerIds === null
        ? (0, drizzle_orm_1.sql) `true`
        : allowedSellerIds.length
            ? (0, drizzle_orm_1.inArray)(adminCrm_1.crmTasks.sellerId, allowedSellerIds)
            : (0, drizzle_orm_1.sql) `false`;
    const [taskStats] = await client_1.db
        .select({
        open: (0, drizzle_orm_1.sql) `count(*) filter (where ${adminCrm_1.crmTasks.status} in ('open','in_progress'))::int`,
        overdue: (0, drizzle_orm_1.sql) `count(*) filter (where ${adminCrm_1.crmTasks.dueAt} < now() and ${adminCrm_1.crmTasks.status} not in ('completed','cancelled'))::int`,
        dueToday: (0, drizzle_orm_1.sql) `count(*) filter (where ${adminCrm_1.crmTasks.dueAt} >= current_date and ${adminCrm_1.crmTasks.dueAt} < current_date + interval '1 day' and ${adminCrm_1.crmTasks.status} not in ('completed','cancelled'))::int`,
        escalated: (0, drizzle_orm_1.sql) `count(*) filter (where ${adminCrm_1.crmTasks.status} = 'escalated')::int`,
    })
        .from(adminCrm_1.crmTasks)
        .where(sellerScope);
    let sellerCount = 0;
    if (allowedSellerIds === null) {
        const [row] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(users_1.users)
            .where((0, drizzle_orm_1.eq)(users_1.users.role, 'customer'));
        sellerCount = Number(row?.count || 0);
    }
    else {
        sellerCount = allowedSellerIds.length;
    }
    const unassignedResult = await client_1.db.execute((0, drizzle_orm_1.sql) `
    select count(*)::int as count from users u
    where u.role = 'customer' and not exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = u.id and sa.assignment_type = 'primary' and sa.is_active = true
    )
  `);
    return {
        assignedSellers: sellerCount,
        unassignedSellers: access.actorType === 'admin' || access.scopeType === 'all'
            ? Number(unassignedResult?.rows?.[0]?.count || unassignedResult?.[0]?.count || 0)
            : 0,
        ...taskStats,
    };
};
exports.getCrmDashboard = getCrmDashboard;
const getTeamPerformance = async (access) => {
    requirePermission(access, 'reports', 'view');
    const allowedStaffIds = await (0, exports.getAccessibleStaffIds)(access);
    const where = allowedStaffIds === null
        ? undefined
        : allowedStaffIds.length
            ? (0, drizzle_orm_1.inArray)(adminCrm_1.adminStaff.id, allowedStaffIds)
            : (0, drizzle_orm_1.sql) `false`;
    return client_1.db
        .select({
        id: adminCrm_1.adminStaff.id,
        name: adminCrm_1.adminStaff.name,
        department: adminCrm_1.adminStaff.department,
        designation: adminCrm_1.adminStaff.designation,
        roleName: adminCrm_1.adminRoles.name,
        assignedSellers: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_seller_assignments sa
        where sa.staff_id = ${adminCrm_1.adminStaff.id} and sa.is_active = true
      )`,
        openTasks: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminCrm_1.adminStaff.id} and ct.status in ('open','in_progress','escalated')
      )`,
        overdueTasks: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminCrm_1.adminStaff.id} and ct.due_at < now()
          and ct.status not in ('completed','cancelled')
      )`,
        completedLast30Days: (0, drizzle_orm_1.sql) `(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminCrm_1.adminStaff.id} and ct.status = 'completed'
          and ct.completed_at >= now() - interval '30 days'
      )`,
    })
        .from(adminCrm_1.adminStaff)
        .innerJoin(adminCrm_1.adminRoles, (0, drizzle_orm_1.eq)(adminCrm_1.adminRoles.id, adminCrm_1.adminStaff.roleId))
        .where(where)
        .orderBy((0, drizzle_orm_1.asc)(adminCrm_1.adminStaff.name));
};
exports.getTeamPerformance = getTeamPerformance;
