import { and, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { adminRoles, adminStaff, AdminPermissions } from '../models/schema/adminCrm'
import { users } from '../models/schema/users'

export const ADMIN_PERMISSION_LEVELS = ['none', 'view', 'operate', 'approve', 'manage'] as const
export type AdminPermissionLevel = (typeof ADMIN_PERMISSION_LEVELS)[number]

export type AdminAccessContext = {
  userId: string
  actorType: 'admin' | 'staff'
  staffId: string | null
  roleId: string | null
  roleCode: string
  roleName: string
  scopeType: 'assigned' | 'team' | 'all'
  permissions: AdminPermissions
}

const normalizeLevel = (value: unknown): AdminPermissionLevel =>
  ADMIN_PERMISSION_LEVELS.includes(value as AdminPermissionLevel)
    ? (value as AdminPermissionLevel)
    : 'none'

export const mergePermissions = (rolePermissions: unknown, overrides: unknown): AdminPermissions =>
  ({
    ...(rolePermissions && typeof rolePermissions === 'object' ? rolePermissions : {}),
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  }) as AdminPermissions

export const hasAdminPermission = (
  context: AdminAccessContext,
  module: string,
  required: AdminPermissionLevel = 'view',
) => {
  if (context.actorType === 'admin') return true
  const current = normalizeLevel(context.permissions[module])
  return ADMIN_PERMISSION_LEVELS.indexOf(current) >= ADMIN_PERMISSION_LEVELS.indexOf(required)
}

export const resolveAdminAccess = async (userId: string): Promise<AdminAccessContext | null> => {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) return null
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
    }
  }
  if (user.role !== 'admin_staff') return null

  const [row] = await db
    .select({
      staffId: adminStaff.id,
      roleId: adminStaff.roleId,
      scopeType: adminStaff.scopeType,
      permissionOverrides: adminStaff.permissionOverrides,
      roleCode: adminRoles.code,
      roleName: adminRoles.name,
      rolePermissions: adminRoles.permissions,
    })
    .from(adminStaff)
    .innerJoin(adminRoles, eq(adminRoles.id, adminStaff.roleId))
    .where(
      and(
        eq(adminStaff.userId, userId),
        eq(adminStaff.isActive, true),
        eq(adminRoles.isActive, true),
      ),
    )
    .limit(1)
  if (!row) return null

  return {
    userId,
    actorType: 'staff',
    staffId: row.staffId,
    roleId: row.roleId,
    roleCode: row.roleCode,
    roleName: row.roleName,
    scopeType: ['assigned', 'team', 'all'].includes(row.scopeType)
      ? (row.scopeType as AdminAccessContext['scopeType'])
      : 'assigned',
    permissions: mergePermissions(row.rolePermissions, row.permissionOverrides),
  }
}

export const inferAdminModule = (baseUrl: string, path: string) => {
  const source = `${baseUrl}${path}`.toLowerCase()
  if (source.includes('/manual-couriers')) return 'manualCouriers'
  if (source.includes('/weight-reconciliation')) return 'disputes'
  if (source.includes('/cod-remittance')) return 'cod'
  if (source.includes('/wallet')) return 'wallet'
  if (source.includes('/billing')) return 'billing'
  if (source.includes('/support-ticket')) return 'support'
  if (source.includes('/orders')) return 'orders'
  if (source.includes('/users') && source.includes('/kyc')) return 'kyc'
  if (source.includes('/users')) return 'sellers'
  if (source.includes('/franchise')) return 'franchise'
  if (source.includes('/courier') || source.includes('/zone') || source.includes('/b2b')) {
    return 'shipping'
  }
  if (source.includes('/developer')) return 'developer'
  return 'admin'
}

export const inferRequiredLevel = (
  method: string,
  baseUrl: string,
  path: string,
): AdminPermissionLevel => {
  const source = `${baseUrl}${path}`.toLowerCase()
  if (method.toUpperCase() === 'GET' || source.includes('/shipment-reports')) return 'view'
  if (
    source.includes('/approve') ||
    source.includes('/reject') ||
    source.includes('/adjust') ||
    source.includes('/settle')
  ) {
    return 'approve'
  }
  if (
    source.includes('/credentials') ||
    source.includes('/roles') ||
    source.includes('/employees')
  ) {
    return 'manage'
  }
  return 'operate'
}
