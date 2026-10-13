import bcrypt from 'bcryptjs'
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { sendEmployeeCredentials } from '../../utils/emailSender'
import {
  ADMIN_PERMISSION_LEVELS,
  AdminAccessContext,
  AdminPermissionLevel,
  hasAdminPermission,
} from '../../utils/adminAccess'
import { HttpError } from '../../utils/classes'
import { db } from '../client'
import {
  adminRoles,
  adminStaff,
  crmActivities,
  crmTasks,
  sellerAssignments,
  AdminPermissions,
} from '../schema/adminCrm'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { supportTickets } from '../schema/supportTickets'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import { wallets } from '../schema/wallet'
import { getAllOrdersServiceAdmin } from './adminOrders.service'

const ROLE_CODE = /^[a-z][a-z0-9_]{2,63}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SCOPE_TYPES = new Set(['assigned', 'team', 'all'])
const ASSIGNMENT_TYPES = new Set(['primary', 'support'])
const TASK_STATUSES = new Set(['open', 'in_progress', 'completed', 'cancelled', 'escalated'])
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])

const text = (value: unknown) => String(value ?? '').trim()
const nullableText = (value: unknown) => text(value) || null
const asDate = (value: unknown) => {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid date value')
  return date
}
const pageValues = (input: any, defaultLimit = 20) => ({
  page: Math.max(1, Number(input?.page || 1)),
  limit: Math.min(100, Math.max(1, Number(input?.limit || defaultLimit))),
})

const normalizePermissions = (input: unknown): AdminPermissions => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([module, level]) => [text(module), text(level)] as const)
      .filter(
        ([module, level]) =>
          module && ADMIN_PERMISSION_LEVELS.includes(level as AdminPermissionLevel),
      ),
  ) as AdminPermissions
}

const requirePermission = (
  access: AdminAccessContext,
  module: string,
  level: AdminPermissionLevel,
) => {
  if (!hasAdminPermission(access, module, level)) {
    throw new HttpError(403, `Permission required: ${module}.${level}`)
  }
}

export const getAccessibleStaffIds = async (access: AdminAccessContext) => {
  if (access.actorType === 'admin' || access.scopeType === 'all') return null
  if (!access.staffId) return []
  if (access.scopeType === 'assigned') return [access.staffId]
  const reports = await db
    .select({ id: adminStaff.id })
    .from(adminStaff)
    .where(and(eq(adminStaff.managerStaffId, access.staffId), eq(adminStaff.isActive, true)))
  return [access.staffId, ...reports.map((row) => row.id)]
}

export const getAccessibleSellerIds = async (access: AdminAccessContext) => {
  const staffIds = await getAccessibleStaffIds(access)
  if (staffIds === null) return null
  if (!staffIds.length) return []
  const assignments = await db
    .select({ sellerId: sellerAssignments.sellerId })
    .from(sellerAssignments)
    .where(
      and(
        inArray(sellerAssignments.staffId, staffIds),
        eq(sellerAssignments.isActive, true),
      ),
    )
  return Array.from(new Set(assignments.map((row) => row.sellerId)))
}

export const assertSellerAccess = async (access: AdminAccessContext, sellerId: string) => {
  requirePermission(access, 'sellers', 'view')
  const sellerIds = await getAccessibleSellerIds(access)
  if (sellerIds !== null && !sellerIds.includes(sellerId)) {
    throw new HttpError(403, 'This seller is outside your assigned scope')
  }
  const [seller] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, sellerId), eq(users.role, 'customer')))
    .limit(1)
  if (!seller) throw new HttpError(404, 'Seller not found')
}

export const getAdminCrmSession = async (access: AdminAccessContext) => {
  if (access.actorType === 'admin') return access
  const [staff] = await db
    .select({
      id: adminStaff.id,
      name: adminStaff.name,
      department: adminStaff.department,
      designation: adminStaff.designation,
      employeeCode: adminStaff.employeeCode,
      managerStaffId: adminStaff.managerStaffId,
      isActive: adminStaff.isActive,
    })
    .from(adminStaff)
    .where(eq(adminStaff.id, access.staffId!))
    .limit(1)
  return { ...access, staff }
}

export const listAdminRoles = async () =>
  db.select().from(adminRoles).orderBy(desc(adminRoles.isSystem), asc(adminRoles.name))

export const createAdminRole = async (input: any, actorId: string) => {
  const code = text(input.code).toLowerCase().replace(/[\s-]+/g, '_')
  const name = text(input.name)
  if (!ROLE_CODE.test(code)) throw new HttpError(400, 'Role code must use lowercase letters, numbers and underscores')
  if (!name) throw new HttpError(400, 'Role name is required')
  const [created] = await db
    .insert(adminRoles)
    .values({
      code,
      name,
      description: nullableText(input.description),
      permissions: normalizePermissions(input.permissions),
      isSystem: false,
      isActive: input.isActive !== false,
      createdBy: actorId,
    })
    .returning()
  return created
}

export const updateAdminRole = async (id: string, input: any) => {
  const [current] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1)
  if (!current) throw new HttpError(404, 'Role not found')
  const [updated] = await db
    .update(adminRoles)
    .set({
      name: text(input.name) || current.name,
      description: input.description === undefined ? current.description : nullableText(input.description),
      permissions:
        input.permissions === undefined
          ? current.permissions
          : normalizePermissions(input.permissions),
      isActive: typeof input.isActive === 'boolean' ? input.isActive : current.isActive,
      updatedAt: new Date(),
    })
    .where(eq(adminRoles.id, id))
    .returning()
  return updated
}

export const listAdminStaff = async (input: any, access?: AdminAccessContext) => {
  const { page, limit } = pageValues(input)
  const conditions: any[] = []
  if (access) {
    const allowedStaffIds = await getAccessibleStaffIds(access)
    if (allowedStaffIds !== null) {
      if (!allowedStaffIds.length) return { data: [], totalCount: 0, page, limit }
      conditions.push(inArray(adminStaff.id, allowedStaffIds))
    }
  }
  const search = text(input.search)
  if (search) {
    const term = `%${search}%`
    conditions.push(
      or(
        ilike(adminStaff.name, term),
        ilike(users.email, term),
        ilike(adminStaff.employeeCode, term),
        ilike(adminStaff.department, term),
      ),
    )
  }
  if (input.status === 'active') conditions.push(eq(adminStaff.isActive, true))
  if (input.status === 'inactive') conditions.push(eq(adminStaff.isActive, false))
  if (input.roleId) conditions.push(eq(adminStaff.roleId, text(input.roleId)))
  const where = conditions.length ? and(...conditions) : undefined

  const rows = await db
    .select({
      id: adminStaff.id,
      userId: adminStaff.userId,
      employeeCode: adminStaff.employeeCode,
      name: adminStaff.name,
      email: users.email,
      phone: adminStaff.phone,
      department: adminStaff.department,
      designation: adminStaff.designation,
      roleId: adminStaff.roleId,
      roleName: adminRoles.name,
      roleCode: adminRoles.code,
      managerStaffId: adminStaff.managerStaffId,
      scopeType: adminStaff.scopeType,
      permissionOverrides: adminStaff.permissionOverrides,
      isActive: adminStaff.isActive,
      lastLoginAt: adminStaff.lastLoginAt,
      createdAt: adminStaff.createdAt,
      assignedSellerCount: sql<number>`(
        select count(*)::int from shipray_seller_assignments sa
        where sa.staff_id = ${adminStaff.id} and sa.is_active = true
      )`,
      openTaskCount: sql<number>`(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminStaff.id}
          and ct.status in ('open', 'in_progress', 'escalated')
      )`,
    })
    .from(adminStaff)
    .innerJoin(users, eq(users.id, adminStaff.userId))
    .innerJoin(adminRoles, eq(adminRoles.id, adminStaff.roleId))
    .where(where)
    .orderBy(desc(adminStaff.createdAt))
    .limit(limit)
    .offset((page - 1) * limit)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(adminStaff)
    .innerJoin(users, eq(users.id, adminStaff.userId))
    .where(where)
  return { data: rows, totalCount: Number(count || 0), page, limit }
}

export const createAdminStaff = async (input: any, actorId: string) => {
  const email = text(input.email).toLowerCase()
  const name = text(input.name)
  const password = text(input.password)
  const roleId = text(input.roleId)
  if (!name || !EMAIL.test(email)) throw new HttpError(400, 'Valid name and email are required')
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, 'Password must be at least 8 characters with upper, lower and number')
  }
  if (!roleId) throw new HttpError(400, 'Role is required')
  const scopeType = SCOPE_TYPES.has(text(input.scopeType)) ? text(input.scopeType) : 'assigned'

  const created = await db.transaction(async (tx) => {
    const [role] = await tx
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(and(eq(adminRoles.id, roleId), eq(adminRoles.isActive, true)))
      .limit(1)
    if (!role) throw new HttpError(400, 'Select an active role')
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (existing) throw new HttpError(409, 'An account with this email already exists')
    if (input.managerStaffId) {
      const [manager] = await tx
        .select({ id: adminStaff.id })
        .from(adminStaff)
        .where(and(eq(adminStaff.id, text(input.managerStaffId)), eq(adminStaff.isActive, true)))
        .limit(1)
      if (!manager) throw new HttpError(400, 'Manager not found or inactive')
    }
    const [user] = await tx
      .insert(users)
      .values({
        email,
        phone: nullableText(input.phone),
        passwordHash: await bcrypt.hash(password, 10),
        role: 'admin_staff',
        accountVerified: true,
        emailVerified: true,
        phoneVerified: Boolean(nullableText(input.phone)),
      })
      .returning()
    const [staff] = await tx
      .insert(adminStaff)
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
      .returning()
    return { user, staff }
  })

  sendEmployeeCredentials(email, email, password, 'Shipray Administration').catch((error) =>
    console.error('[AdminCRM] Failed to send staff credentials:', error),
  )
  return created
}

export const updateAdminStaff = async (id: string, input: any, actorId: string) =>
  db.transaction(async (tx) => {
    const [current] = await tx.select().from(adminStaff).where(eq(adminStaff.id, id)).limit(1)
    if (!current) throw new HttpError(404, 'Employee not found')
    if (text(input.managerStaffId) === id) throw new HttpError(400, 'Employee cannot manage themselves')
    if (input.roleId) {
      const [role] = await tx
        .select({ id: adminRoles.id })
        .from(adminRoles)
        .where(and(eq(adminRoles.id, text(input.roleId)), eq(adminRoles.isActive, true)))
        .limit(1)
      if (!role) throw new HttpError(400, 'Select an active role')
    }
    const becomingInactive = current.isActive && input.isActive === false
    const password = text(input.password)
    if (password && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))) {
      throw new HttpError(400, 'Password must be at least 8 characters with upper, lower and number')
    }
    const [updated] = await tx
      .update(adminStaff)
      .set({
        roleId: text(input.roleId) || current.roleId,
        managerStaffId:
          input.managerStaffId === undefined ? current.managerStaffId : nullableText(input.managerStaffId),
        employeeCode:
          input.employeeCode === undefined ? current.employeeCode : nullableText(input.employeeCode),
        name: text(input.name) || current.name,
        phone: input.phone === undefined ? current.phone : nullableText(input.phone),
        department: text(input.department) || current.department,
        designation: text(input.designation) || current.designation,
        scopeType: SCOPE_TYPES.has(text(input.scopeType)) ? text(input.scopeType) : current.scopeType,
        permissionOverrides:
          input.permissionOverrides === undefined
            ? current.permissionOverrides
            : normalizePermissions(input.permissionOverrides),
        isActive: typeof input.isActive === 'boolean' ? input.isActive : current.isActive,
        updatedAt: new Date(),
      })
      .where(eq(adminStaff.id, id))
      .returning()
    if (password || becomingInactive) {
      await tx
        .update(users)
        .set({
          ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
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
        .where(eq(users.id, current.userId))
    }
    if (becomingInactive) {
      await tx
        .update(sellerAssignments)
        .set({ isActive: false, endedAt: new Date(), reason: 'Employee deactivated' })
        .where(and(eq(sellerAssignments.staffId, id), eq(sellerAssignments.isActive, true)))
      await tx
        .update(crmTasks)
        .set({ assignedStaffId: null, status: sql`case when status = 'completed' then status else 'escalated' end`, updatedAt: new Date() })
        .where(eq(crmTasks.assignedStaffId, id))
    }
    const [portfolioSeller] = await tx
      .select({ sellerId: sellerAssignments.sellerId })
      .from(sellerAssignments)
      .where(eq(sellerAssignments.staffId, id))
      .orderBy(desc(sellerAssignments.assignedAt))
      .limit(1)
    if (portfolioSeller) {
      await tx.insert(crmActivities).values({
        sellerId: portfolioSeller.sellerId,
        staffId: id,
        activityType: 'employee_updated',
        summary: becomingInactive
          ? 'Employee deactivated and portfolio released'
          : 'Employee access updated',
        metadata: { actorId },
        createdBy: actorId,
      })
    }
    return updated
  })

export const listCrmSellers = async (access: AdminAccessContext, input: any) => {
  requirePermission(access, 'sellers', 'view')
  const { page, limit } = pageValues(input)
  const allowedIds = await getAccessibleSellerIds(access)
  if (allowedIds !== null && !allowedIds.length) return { data: [], totalCount: 0, page, limit }
  const conditions: any[] = [eq(users.role, 'customer')]
  if (allowedIds !== null) conditions.push(inArray(users.id, allowedIds))
  const search = text(input.search)
  if (search) {
    const term = `%${search}%`
    conditions.push(
      or(
        ilike(users.email, term),
        ilike(users.phone, term),
        sql`coalesce(${userProfiles.companyInfo}->>'companyName', '') ilike ${term}`,
        sql`coalesce(${userProfiles.companyInfo}->>'contactPerson', '') ilike ${term}`,
      ),
    )
  }
  if (input.assignment === 'unassigned') {
    conditions.push(sql`not exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = ${users.id} and sa.assignment_type = 'primary' and sa.is_active = true
    )`)
  }
  if (input.staffId) {
    conditions.push(sql`exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = ${users.id} and sa.staff_id = ${text(input.staffId)} and sa.is_active = true
    )`)
  }
  const where = and(...conditions)
  const selection = {
    id: users.id,
    email: users.email,
    phone: users.phone,
    createdAt: users.createdAt,
    companyInfo: userProfiles.companyInfo,
    businessType: userProfiles.businessType,
    approved: userProfiles.approved,
    onboardingComplete: userProfiles.onboardingComplete,
    domesticKyc: userProfiles.domesticKyc,
    walletBalance: wallets.balance,
    primaryStaffId: sql<string | null>`(
      select sa.staff_id from shipray_seller_assignments sa
      where sa.seller_id = ${users.id} and sa.assignment_type = 'primary' and sa.is_active = true
      limit 1
    )`,
    primaryStaffName: sql<string | null>`(
      select ast.name from shipray_seller_assignments sa
      join shipray_admin_staff ast on ast.id = sa.staff_id
      where sa.seller_id = ${users.id} and sa.assignment_type = 'primary' and sa.is_active = true
      limit 1
    )`,
    orderCount: sql<number>`(
      (select count(*) from b2c_orders bo where bo.user_id = ${users.id}) +
      (select count(*) from b2b_orders bo where bo.user_id = ${users.id})
    )::int`,
    openTaskCount: sql<number>`(
      select count(*)::int from shipray_crm_tasks ct
      where ct.seller_id = ${users.id} and ct.status in ('open', 'in_progress', 'escalated')
    )`,
  }
  const rows = await db
    .select(selection)
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(where)
  return { data: rows, totalCount: Number(count || 0), page, limit }
}

export const getCrmSellerDetail = async (access: AdminAccessContext, sellerId: string) => {
  await assertSellerAccess(access, sellerId)
  const [seller] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      createdAt: users.createdAt,
      companyInfo: userProfiles.companyInfo,
      businessType: userProfiles.businessType,
      approved: userProfiles.approved,
      onboardingComplete: userProfiles.onboardingComplete,
      domesticKyc: userProfiles.domesticKyc,
      gstDetails: userProfiles.gstDetails,
      walletBalance: wallets.balance,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(wallets, eq(wallets.userId, users.id))
    .where(eq(users.id, sellerId))
    .limit(1)
  const orderStatsResult: any = await db.execute(sql`
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
  `)
  const assignments = await db
    .select({
      id: sellerAssignments.id,
      staffId: sellerAssignments.staffId,
      staffName: adminStaff.name,
      assignmentType: sellerAssignments.assignmentType,
      assignedAt: sellerAssignments.assignedAt,
    })
    .from(sellerAssignments)
    .innerJoin(adminStaff, eq(adminStaff.id, sellerAssignments.staffId))
    .where(and(eq(sellerAssignments.sellerId, sellerId), eq(sellerAssignments.isActive, true)))
  const [openTickets] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.userId, sellerId),
        inArray(supportTickets.status, ['open', 'in_progress']),
      ),
    )
  return {
    seller,
    assignments,
    orderStats: orderStatsResult?.rows?.[0] || orderStatsResult?.[0] || {},
    openTickets: Number(openTickets?.count || 0),
  }
}

export const getCrmSellerOrders = async (
  access: AdminAccessContext,
  sellerId: string,
  input: any,
) => {
  await assertSellerAccess(access, sellerId)
  requirePermission(access, 'orders', 'view')
  const { page, limit } = pageValues(input, 10)
  return getAllOrdersServiceAdmin({
    page,
    limit,
    filters: {
      userId: sellerId,
      status: text(input.status) || undefined,
      search: text(input.search) || undefined,
      sortOrder: 'desc',
    },
  })
}

export const assignSeller = async (
  access: AdminAccessContext,
  input: any,
  actorId: string,
) => {
  requirePermission(access, 'assignments', 'manage')
  const sellerId = text(input.sellerId)
  const staffId = text(input.staffId)
  const assignmentType = ASSIGNMENT_TYPES.has(text(input.assignmentType))
    ? text(input.assignmentType)
    : 'primary'
  if (!sellerId || !staffId) throw new HttpError(400, 'Seller and employee are required')
  if (access.actorType === 'staff' && access.scopeType !== 'all') {
    const allowedStaffIds = await getAccessibleStaffIds(access)
    if (!allowedStaffIds?.includes(staffId)) {
      throw new HttpError(403, 'Employee is outside your team scope')
    }
    await assertSellerAccess(access, sellerId)
  }
  return db.transaction(async (tx) => {
    const [seller] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, sellerId), eq(users.role, 'customer')))
      .limit(1)
    if (!seller) throw new HttpError(404, 'Seller not found')
    const [staff] = await tx
      .select({ id: adminStaff.id, name: adminStaff.name })
      .from(adminStaff)
      .where(and(eq(adminStaff.id, staffId), eq(adminStaff.isActive, true)))
      .limit(1)
    if (!staff) throw new HttpError(400, 'Employee not found or inactive')
    await tx.execute(
      sql`select id from users where id = ${sellerId} for update`,
    )
    if (assignmentType === 'primary') {
      await tx
        .update(sellerAssignments)
        .set({ isActive: false, endedAt: new Date(), reason: nullableText(input.reason) || 'Reassigned' })
        .where(
          and(
            eq(sellerAssignments.sellerId, sellerId),
            eq(sellerAssignments.assignmentType, 'primary'),
            eq(sellerAssignments.isActive, true),
          ),
        )
    }
    const [existing] = await tx
      .select()
      .from(sellerAssignments)
      .where(
        and(
          eq(sellerAssignments.sellerId, sellerId),
          eq(sellerAssignments.staffId, staffId),
          eq(sellerAssignments.assignmentType, assignmentType),
          eq(sellerAssignments.isActive, true),
        ),
      )
      .limit(1)
    const assignment = existing || (
      await tx
        .insert(sellerAssignments)
        .values({
          sellerId,
          staffId,
          assignmentType,
          reason: nullableText(input.reason),
          assignedBy: actorId,
        })
        .returning()
    )[0]
    await tx.insert(crmActivities).values({
      sellerId,
      staffId,
      activityType: assignmentType === 'primary' ? 'seller_assigned' : 'support_assigned',
      summary: `${staff.name} assigned as ${assignmentType} owner`,
      notes: nullableText(input.reason),
      metadata: { assignmentId: assignment.id },
      createdBy: actorId,
    })
    return assignment
  })
}

export const listAssignments = async (input: any, access?: AdminAccessContext) => {
  const { page, limit } = pageValues(input)
  const conditions: any[] = [eq(sellerAssignments.isActive, true)]
  if (access) {
    const allowedStaffIds = await getAccessibleStaffIds(access)
    if (allowedStaffIds !== null) {
      if (!allowedStaffIds.length) return { data: [], totalCount: 0, page, limit }
      conditions.push(inArray(sellerAssignments.staffId, allowedStaffIds))
    }
  }
  if (input.staffId) conditions.push(eq(sellerAssignments.staffId, text(input.staffId)))
  if (input.assignmentType) {
    conditions.push(eq(sellerAssignments.assignmentType, text(input.assignmentType)))
  }
  const where = and(...conditions)
  const rows = await db
    .select({
      id: sellerAssignments.id,
      sellerId: sellerAssignments.sellerId,
      sellerEmail: users.email,
      sellerPhone: users.phone,
      companyInfo: userProfiles.companyInfo,
      staffId: sellerAssignments.staffId,
      staffName: adminStaff.name,
      assignmentType: sellerAssignments.assignmentType,
      reason: sellerAssignments.reason,
      assignedAt: sellerAssignments.assignedAt,
    })
    .from(sellerAssignments)
    .innerJoin(users, eq(users.id, sellerAssignments.sellerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(adminStaff, eq(adminStaff.id, sellerAssignments.staffId))
    .where(where)
    .orderBy(desc(sellerAssignments.assignedAt))
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sellerAssignments)
    .where(where)
  return { data: rows, totalCount: Number(count || 0), page, limit }
}

export const endAssignment = async (
  access: AdminAccessContext,
  id: string,
  actorId: string,
  reason?: string,
) => {
  const [current] = await db
    .select({ staffId: sellerAssignments.staffId })
    .from(sellerAssignments)
    .where(and(eq(sellerAssignments.id, id), eq(sellerAssignments.isActive, true)))
    .limit(1)
  if (!current) throw new HttpError(404, 'Active assignment not found')
  const allowedStaffIds = await getAccessibleStaffIds(access)
  if (allowedStaffIds !== null && !allowedStaffIds.includes(current.staffId)) {
    throw new HttpError(403, 'Assignment is outside your team scope')
  }
  return db.transaction(async (tx) => {
    const [assignment] = await tx
      .update(sellerAssignments)
      .set({ isActive: false, endedAt: new Date(), reason: nullableText(reason) || 'Assignment ended' })
      .where(and(eq(sellerAssignments.id, id), eq(sellerAssignments.isActive, true)))
      .returning()
    if (!assignment) throw new HttpError(404, 'Active assignment not found')
    await tx.insert(crmActivities).values({
      sellerId: assignment.sellerId,
      staffId: assignment.staffId,
      activityType: 'assignment_ended',
      summary: 'Seller assignment ended',
      notes: nullableText(reason),
      createdBy: actorId,
    })
    return assignment
  })
}

export const listCrmTasks = async (access: AdminAccessContext, input: any) => {
  requirePermission(access, 'crm', 'view')
  const { page, limit } = pageValues(input)
  const allowedSellerIds = await getAccessibleSellerIds(access)
  if (allowedSellerIds !== null && !allowedSellerIds.length) {
    return { data: [], totalCount: 0, page, limit }
  }
  const conditions: any[] = []
  if (allowedSellerIds !== null) conditions.push(inArray(crmTasks.sellerId, allowedSellerIds))
  if (input.status) conditions.push(eq(crmTasks.status, text(input.status)))
  if (input.staffId) conditions.push(eq(crmTasks.assignedStaffId, text(input.staffId)))
  if (input.sellerId) conditions.push(eq(crmTasks.sellerId, text(input.sellerId)))
  if (input.due === 'overdue') {
    conditions.push(sql`${crmTasks.dueAt} < now() and ${crmTasks.status} not in ('completed','cancelled')`)
  }
  if (input.due === 'today') {
    conditions.push(sql`${crmTasks.dueAt} >= current_date and ${crmTasks.dueAt} < current_date + interval '1 day'`)
  }
  const where = conditions.length ? and(...conditions) : undefined
  const rows = await db
    .select({
      id: crmTasks.id,
      sellerId: crmTasks.sellerId,
      sellerEmail: users.email,
      companyInfo: userProfiles.companyInfo,
      assignedStaffId: crmTasks.assignedStaffId,
      assignedStaffName: adminStaff.name,
      category: crmTasks.category,
      title: crmTasks.title,
      description: crmTasks.description,
      priority: crmTasks.priority,
      status: crmTasks.status,
      dueAt: crmTasks.dueAt,
      completedAt: crmTasks.completedAt,
      outcome: crmTasks.outcome,
      nextFollowUpAt: crmTasks.nextFollowUpAt,
      createdAt: crmTasks.createdAt,
    })
    .from(crmTasks)
    .innerJoin(users, eq(users.id, crmTasks.sellerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(adminStaff, eq(adminStaff.id, crmTasks.assignedStaffId))
    .where(where)
    .orderBy(asc(sql`case when ${crmTasks.dueAt} is null then 1 else 0 end`), asc(crmTasks.dueAt))
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmTasks)
    .where(where)
  return { data: rows, totalCount: Number(count || 0), page, limit }
}

export const createCrmTask = async (
  access: AdminAccessContext,
  input: any,
  actorId: string,
) => {
  requirePermission(access, 'crm', 'operate')
  const sellerId = text(input.sellerId)
  await assertSellerAccess(access, sellerId)
  const title = text(input.title)
  if (!title) throw new HttpError(400, 'Task title is required')
  const assignedStaffId = nullableText(input.assignedStaffId) || access.staffId
  if (assignedStaffId) {
    const allowedStaffIds = await getAccessibleStaffIds(access)
    if (allowedStaffIds !== null && !allowedStaffIds.includes(assignedStaffId)) {
      throw new HttpError(403, 'Task assignee is outside your team scope')
    }
  }
  const [created] = await db
    .insert(crmTasks)
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
    .returning()
  await db.insert(crmActivities).values({
    sellerId,
    staffId: assignedStaffId,
    taskId: created.id,
    activityType: 'task_created',
    summary: `Task created: ${title}`,
    notes: nullableText(input.description),
    createdBy: actorId,
  })
  return created
}

export const updateCrmTask = async (
  access: AdminAccessContext,
  id: string,
  input: any,
  actorId: string,
) => {
  requirePermission(access, 'crm', 'operate')
  const [current] = await db.select().from(crmTasks).where(eq(crmTasks.id, id)).limit(1)
  if (!current) throw new HttpError(404, 'CRM task not found')
  await assertSellerAccess(access, current.sellerId)
  const requestedStaffId =
    input.assignedStaffId === undefined ? current.assignedStaffId : nullableText(input.assignedStaffId)
  if (requestedStaffId) {
    const allowedStaffIds = await getAccessibleStaffIds(access)
    if (allowedStaffIds !== null && !allowedStaffIds.includes(requestedStaffId)) {
      throw new HttpError(403, 'Task assignee is outside your team scope')
    }
  }
  const status = TASK_STATUSES.has(text(input.status)) ? text(input.status) : current.status
  const [updated] = await db
    .update(crmTasks)
    .set({
      assignedStaffId: requestedStaffId,
      category: text(input.category) || current.category,
      title: text(input.title) || current.title,
      description:
        input.description === undefined ? current.description : nullableText(input.description),
      priority: TASK_PRIORITIES.has(text(input.priority)) ? text(input.priority) : current.priority,
      status,
      dueAt: input.dueAt === undefined ? current.dueAt : asDate(input.dueAt),
      completedAt: status === 'completed' ? new Date() : status !== current.status ? null : current.completedAt,
      outcome: input.outcome === undefined ? current.outcome : nullableText(input.outcome),
      nextFollowUpAt:
        input.nextFollowUpAt === undefined ? current.nextFollowUpAt : asDate(input.nextFollowUpAt),
      updatedAt: new Date(),
    })
    .where(eq(crmTasks.id, id))
    .returning()
  await db.insert(crmActivities).values({
    sellerId: current.sellerId,
    staffId: updated.assignedStaffId,
    taskId: id,
    activityType: status === 'completed' ? 'task_completed' : 'task_updated',
    summary: status === 'completed' ? `Task completed: ${updated.title}` : `Task updated: ${updated.title}`,
    notes: nullableText(input.outcome),
    metadata: { previousStatus: current.status, status },
    createdBy: actorId,
  })
  return updated
}

export const addCrmActivity = async (
  access: AdminAccessContext,
  input: any,
  actorId: string,
) => {
  requirePermission(access, 'crm', 'operate')
  const sellerId = text(input.sellerId)
  await assertSellerAccess(access, sellerId)
  const summary = text(input.summary)
  if (!summary) throw new HttpError(400, 'Activity summary is required')
  const [created] = await db
    .insert(crmActivities)
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
    .returning()
  return created
}

export const listCrmActivities = async (access: AdminAccessContext, input: any) => {
  requirePermission(access, 'crm', 'view')
  const { page, limit } = pageValues(input)
  const allowedSellerIds = await getAccessibleSellerIds(access)
  if (allowedSellerIds !== null && !allowedSellerIds.length) {
    return { data: [], totalCount: 0, page, limit }
  }
  const conditions: any[] = []
  if (allowedSellerIds !== null) conditions.push(inArray(crmActivities.sellerId, allowedSellerIds))
  if (input.sellerId) conditions.push(eq(crmActivities.sellerId, text(input.sellerId)))
  if (input.staffId) conditions.push(eq(crmActivities.staffId, text(input.staffId)))
  if (input.activityType) conditions.push(eq(crmActivities.activityType, text(input.activityType)))
  const where = conditions.length ? and(...conditions) : undefined
  const rows = await db
    .select({
      id: crmActivities.id,
      sellerId: crmActivities.sellerId,
      sellerEmail: users.email,
      companyInfo: userProfiles.companyInfo,
      staffId: crmActivities.staffId,
      staffName: adminStaff.name,
      taskId: crmActivities.taskId,
      activityType: crmActivities.activityType,
      summary: crmActivities.summary,
      notes: crmActivities.notes,
      metadata: crmActivities.metadata,
      occurredAt: crmActivities.occurredAt,
      createdAt: crmActivities.createdAt,
    })
    .from(crmActivities)
    .innerJoin(users, eq(users.id, crmActivities.sellerId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(adminStaff, eq(adminStaff.id, crmActivities.staffId))
    .where(where)
    .orderBy(desc(crmActivities.occurredAt))
    .limit(limit)
    .offset((page - 1) * limit)
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(crmActivities)
    .where(where)
  return { data: rows, totalCount: Number(count || 0), page, limit }
}

export const getCrmDashboard = async (access: AdminAccessContext) => {
  requirePermission(access, 'crm', 'view')
  const allowedSellerIds = await getAccessibleSellerIds(access)
  const sellerScope = allowedSellerIds === null
    ? sql`true`
    : allowedSellerIds.length
      ? inArray(crmTasks.sellerId, allowedSellerIds)
      : sql`false`
  const [taskStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${crmTasks.status} in ('open','in_progress'))::int`,
      overdue: sql<number>`count(*) filter (where ${crmTasks.dueAt} < now() and ${crmTasks.status} not in ('completed','cancelled'))::int`,
      dueToday: sql<number>`count(*) filter (where ${crmTasks.dueAt} >= current_date and ${crmTasks.dueAt} < current_date + interval '1 day' and ${crmTasks.status} not in ('completed','cancelled'))::int`,
      escalated: sql<number>`count(*) filter (where ${crmTasks.status} = 'escalated')::int`,
    })
    .from(crmTasks)
    .where(sellerScope)
  let sellerCount = 0
  if (allowedSellerIds === null) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'customer'))
    sellerCount = Number(row?.count || 0)
  } else {
    sellerCount = allowedSellerIds.length
  }
  const unassignedResult: any = await db.execute(sql`
    select count(*)::int as count from users u
    where u.role = 'customer' and not exists (
      select 1 from shipray_seller_assignments sa
      where sa.seller_id = u.id and sa.assignment_type = 'primary' and sa.is_active = true
    )
  `)
  return {
    assignedSellers: sellerCount,
    unassignedSellers:
      access.actorType === 'admin' || access.scopeType === 'all'
        ? Number(unassignedResult?.rows?.[0]?.count || unassignedResult?.[0]?.count || 0)
        : 0,
    ...taskStats,
  }
}

export const getTeamPerformance = async (access: AdminAccessContext) => {
  requirePermission(access, 'reports', 'view')
  const allowedStaffIds = await getAccessibleStaffIds(access)
  const where = allowedStaffIds === null
    ? undefined
    : allowedStaffIds.length
      ? inArray(adminStaff.id, allowedStaffIds)
      : sql`false`
  return db
    .select({
      id: adminStaff.id,
      name: adminStaff.name,
      department: adminStaff.department,
      designation: adminStaff.designation,
      roleName: adminRoles.name,
      assignedSellers: sql<number>`(
        select count(*)::int from shipray_seller_assignments sa
        where sa.staff_id = ${adminStaff.id} and sa.is_active = true
      )`,
      openTasks: sql<number>`(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminStaff.id} and ct.status in ('open','in_progress','escalated')
      )`,
      overdueTasks: sql<number>`(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminStaff.id} and ct.due_at < now()
          and ct.status not in ('completed','cancelled')
      )`,
      completedLast30Days: sql<number>`(
        select count(*)::int from shipray_crm_tasks ct
        where ct.assigned_staff_id = ${adminStaff.id} and ct.status = 'completed'
          and ct.completed_at >= now() - interval '30 days'
      )`,
    })
    .from(adminStaff)
    .innerJoin(adminRoles, eq(adminRoles.id, adminStaff.roleId))
    .where(where)
    .orderBy(asc(adminStaff.name))
}
