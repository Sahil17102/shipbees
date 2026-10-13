import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { db, pool } from '../models/client'
import {
  getCrmDashboard,
  getCrmSellerDetail,
  getCrmSellerOrders,
  listAdminRoles,
  listCrmSellers,
} from '../models/services/adminCrm.service'
import { users } from '../models/schema/users'
import { adminRoles, adminStaff, sellerAssignments } from '../models/schema/adminCrm'
import { resolveAdminAccess } from '../utils/adminAccess'

const run = async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1)
  if (!admin) throw new Error('Admin account not found')
  const access = await resolveAdminAccess(admin.id)
  if (!access) throw new Error('Admin access context could not be resolved')

  const [roles, sellers, dashboard] = await Promise.all([
    listAdminRoles(),
    listCrmSellers(access, { page: 1, limit: 2 }),
    getCrmDashboard(access),
  ])
  if (roles.length < 6) throw new Error('Default CRM roles were not seeded')
  if (!Number.isFinite(Number(sellers.totalCount))) throw new Error('Seller pagination is invalid')

  let sellerDetailChecked = false
  if (sellers.data[0]?.id) {
    await getCrmSellerDetail(access, sellers.data[0].id)
    await getCrmSellerOrders(access, sellers.data[0].id, { page: 1, limit: 2 })
    sellerDetailChecked = true
  }

  let staffScopeChecked = false
  if (sellers.data[0]?.id) {
    const testEmail = `crm-check-${randomUUID()}@example.invalid`
    const [role] = await db
      .select({ id: adminRoles.id })
      .from(adminRoles)
      .where(eq(adminRoles.code, 'relationship_manager'))
      .limit(1)
    const [testUser] = await db
      .insert(users)
      .values({ email: testEmail, role: 'admin_staff', emailVerified: true, accountVerified: true })
      .returning({ id: users.id })
    let testStaffId: string | null = null
    try {
      const [staff] = await db
        .insert(adminStaff)
        .values({
          userId: testUser.id,
          roleId: role.id,
          name: 'CRM Scope Check',
          department: 'Quality',
          designation: 'Check',
          scopeType: 'assigned',
          createdBy: admin.id,
        })
        .returning({ id: adminStaff.id })
      testStaffId = staff.id
      const staffAccess = await resolveAdminAccess(testUser.id)
      if (!staffAccess) throw new Error('Staff access context could not be resolved')
      const emptyPortfolio = await listCrmSellers(staffAccess, { limit: 5 })
      if (emptyPortfolio.totalCount !== 0) throw new Error('Unassigned staff could see sellers')
      await db.insert(sellerAssignments).values({
        sellerId: sellers.data[0].id,
        staffId: staff.id,
        assignmentType: 'primary',
        assignedBy: admin.id,
      })
      const assignedPortfolio = await listCrmSellers(staffAccess, { limit: 5 })
      if (assignedPortfolio.totalCount !== 1) throw new Error('Assigned seller scope failed')
      staffScopeChecked = true
      await db
        .delete(sellerAssignments)
        .where(and(eq(sellerAssignments.staffId, staff.id), eq(sellerAssignments.sellerId, sellers.data[0].id)))
    } finally {
      if (testStaffId) {
        await db.delete(sellerAssignments).where(eq(sellerAssignments.staffId, testStaffId))
      }
      await db.delete(users).where(eq(users.id, testUser.id))
    }
  }

  console.log('Admin CRM checks passed', {
    roles: roles.length,
    sellers: sellers.totalCount,
    sellerDetailChecked,
    staffScopeChecked,
    openTasks: dashboard.open,
    unassignedSellers: dashboard.unassignedSellers,
  })
}

run()
  .catch((error) => {
    console.error('Admin CRM checks failed:', error?.message || error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
