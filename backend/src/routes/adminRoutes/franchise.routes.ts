import { Router } from 'express'
import {
  createFranchiseProduct,
  createFranchiseRule,
  getFranchiseAdminOverview,
  getFranchiseReportsAdmin,
  getFranchiseTerritoryDetails,
  listFranchiseAgreements,
  listFranchiseApplications,
  listFranchiseAudit,
  listFranchiseExceptions,
  listFranchiseOrganizations,
  listFranchiseProducts,
  listFranchiseRules,
  listFranchiseSettlements,
  listFranchiseTerritories,
  publishFranchiseRule,
  updateFranchiseApplication,
} from '../../controllers/admin/franchise.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

router.use(requireAuth, isAdminMiddleware)
router.get('/overview', getFranchiseAdminOverview)
router.get('/applications', listFranchiseApplications)
router.patch('/applications/:id/action', updateFranchiseApplication)
router.get('/products', listFranchiseProducts)
router.post('/products', createFranchiseProduct)
router.get('/territories', listFranchiseTerritories)
router.get('/territories/:id/details', getFranchiseTerritoryDetails)
router.get('/franchises', listFranchiseOrganizations)
router.get('/agreements', listFranchiseAgreements)
router.get('/commission-rules', listFranchiseRules)
router.post('/commission-rules', createFranchiseRule)
router.patch('/commission-rules/:id/publish', publishFranchiseRule)
router.get('/settlements', listFranchiseSettlements)
router.get('/reports', getFranchiseReportsAdmin)
router.get('/exceptions', listFranchiseExceptions)
router.get('/audit', listFranchiseAudit)

export default router
