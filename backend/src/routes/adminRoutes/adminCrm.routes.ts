import { Router } from 'express'
import {
  assignSellerController,
  createActivityController,
  createRoleController,
  createStaffController,
  createTaskController,
  dashboardController,
  endAssignmentController,
  listActivitiesController,
  listAssignmentsController,
  listRolesController,
  listSellersController,
  listStaffController,
  listTasksController,
  loadAdminCrmAccess,
  performanceController,
  sellerDetailController,
  sellerOrdersController,
  sessionController,
  updateRoleController,
  updateStaffController,
  updateTaskController,
} from '../../controllers/admin/adminCrm.controller'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()
router.use(requireAuth, loadAdminCrmAccess)

router.get('/session', sessionController)
router.get('/dashboard', dashboardController)
router.get('/roles', listRolesController)
router.post('/roles', createRoleController)
router.patch('/roles/:id', updateRoleController)
router.get('/employees', listStaffController)
router.post('/employees', createStaffController)
router.patch('/employees/:id', updateStaffController)
router.get('/sellers', listSellersController)
router.get('/sellers/:id', sellerDetailController)
router.get('/sellers/:id/orders', sellerOrdersController)
router.get('/assignments', listAssignmentsController)
router.post('/assignments', assignSellerController)
router.post('/assignments/:id/end', endAssignmentController)
router.get('/tasks', listTasksController)
router.post('/tasks', createTaskController)
router.patch('/tasks/:id', updateTaskController)
router.get('/activities', listActivitiesController)
router.post('/activities', createActivityController)
router.get('/performance', performanceController)

export default router
