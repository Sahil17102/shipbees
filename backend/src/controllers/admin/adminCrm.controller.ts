import { NextFunction, Response } from 'express'
import {
  addCrmActivity,
  assignSeller,
  createAdminRole,
  createAdminStaff,
  createCrmTask,
  endAssignment,
  getAdminCrmSession,
  getCrmDashboard,
  getCrmSellerDetail,
  getCrmSellerOrders,
  getTeamPerformance,
  listAdminRoles,
  listAdminStaff,
  listAssignments,
  listCrmActivities,
  listCrmSellers,
  listCrmTasks,
  updateAdminRole,
  updateAdminStaff,
  updateCrmTask,
} from '../../models/services/adminCrm.service'
import {
  AdminAccessContext,
  AdminPermissionLevel,
  hasAdminPermission,
  resolveAdminAccess,
} from '../../utils/adminAccess'
import { HttpError } from '../../utils/classes'

const actorId = (req: any) => {
  const id = String(req.user?.sub || '').trim()
  if (!id) throw new HttpError(401, 'Unauthorized')
  return id
}

const access = (req: any): AdminAccessContext => {
  if (!req.adminAccess) throw new HttpError(401, 'Admin access context is missing')
  return req.adminAccess
}

const requirePermission = (
  req: any,
  module: string,
  level: AdminPermissionLevel = 'view',
) => {
  if (!hasAdminPermission(access(req), module, level)) {
    throw new HttpError(403, `Permission required: ${module}.${level}`)
  }
}

const requireSuperAdmin = (req: any) => {
  if (access(req).actorType !== 'admin') {
    throw new HttpError(403, 'Only a super admin can change staff accounts or access policies')
  }
}

const sendError = (res: Response, error: any) => {
  console.error('[AdminCRM]', error)
  const status = Number(error?.statusCode || error?.status || 500)
  return res.status(Number.isFinite(status) ? status : 500).json({
    success: false,
    message: error?.message || 'CRM operation failed',
  })
}

export const loadAdminCrmAccess = async (req: any, res: Response, next: NextFunction) => {
  try {
    const context = await resolveAdminAccess(actorId(req))
    if (!context) return res.status(403).json({ success: false, message: 'Admin access required' })
    req.adminAccess = context
    return next()
  } catch (error) {
    return sendError(res, error)
  }
}

export const sessionController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getAdminCrmSession(access(req)) })
  } catch (error) { return sendError(res, error) }
}

export const dashboardController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getCrmDashboard(access(req)) })
  } catch (error) { return sendError(res, error) }
}

export const listRolesController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'view')
    return res.json({ success: true, data: await listAdminRoles() })
  } catch (error) { return sendError(res, error) }
}

export const createRoleController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'manage')
    requireSuperAdmin(req)
    return res.status(201).json({ success: true, data: await createAdminRole(req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const updateRoleController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'manage')
    requireSuperAdmin(req)
    return res.json({ success: true, data: await updateAdminRole(req.params.id, req.body) })
  } catch (error) { return sendError(res, error) }
}

export const listStaffController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'view')
    return res.json({ success: true, ...(await listAdminStaff(req.query, access(req))) })
  } catch (error) { return sendError(res, error) }
}

export const createStaffController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'manage')
    requireSuperAdmin(req)
    return res.status(201).json({ success: true, data: await createAdminStaff(req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const updateStaffController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'employees', 'manage')
    requireSuperAdmin(req)
    return res.json({ success: true, data: await updateAdminStaff(req.params.id, req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const listSellersController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, ...(await listCrmSellers(access(req), req.query)) })
  } catch (error) { return sendError(res, error) }
}

export const sellerDetailController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getCrmSellerDetail(access(req), req.params.id) })
  } catch (error) { return sendError(res, error) }
}

export const sellerOrdersController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, ...(await getCrmSellerOrders(access(req), req.params.id, req.query)) })
  } catch (error) { return sendError(res, error) }
}

export const listAssignmentsController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'assignments', 'view')
    return res.json({ success: true, ...(await listAssignments(req.query, access(req))) })
  } catch (error) { return sendError(res, error) }
}

export const assignSellerController = async (req: any, res: Response) => {
  try {
    return res.status(201).json({ success: true, data: await assignSeller(access(req), req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const endAssignmentController = async (req: any, res: Response) => {
  try {
    requirePermission(req, 'assignments', 'manage')
    return res.json({ success: true, data: await endAssignment(access(req), req.params.id, actorId(req), req.body?.reason) })
  } catch (error) { return sendError(res, error) }
}

export const listTasksController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, ...(await listCrmTasks(access(req), req.query)) })
  } catch (error) { return sendError(res, error) }
}

export const createTaskController = async (req: any, res: Response) => {
  try {
    return res.status(201).json({ success: true, data: await createCrmTask(access(req), req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const updateTaskController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await updateCrmTask(access(req), req.params.id, req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const listActivitiesController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, ...(await listCrmActivities(access(req), req.query)) })
  } catch (error) { return sendError(res, error) }
}

export const createActivityController = async (req: any, res: Response) => {
  try {
    return res.status(201).json({ success: true, data: await addCrmActivity(access(req), req.body, actorId(req)) })
  } catch (error) { return sendError(res, error) }
}

export const performanceController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getTeamPerformance(access(req)) })
  } catch (error) { return sendError(res, error) }
}
