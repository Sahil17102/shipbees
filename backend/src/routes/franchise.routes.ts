import { NextFunction, Request, Response, Router } from 'express'
import {
  createFranchiseDispute,
  franchiseLogin,
  getFranchiseDashboard,
  getFranchiseDisputes,
  getFranchiseDocuments,
  getFranchiseEarnings,
  getFranchiseMe,
  getFranchiseOrders,
  getFranchiseNdr,
  getFranchiseReports,
  getFranchiseRto,
  getFranchiseSettlements,
  getFranchiseTeam,
  getFranchiseTerritories,
  getFranchiseTracking,
  getPublicFranchiseOpportunities,
  submitPublicFranchiseApplication,
} from '../controllers/franchise.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { requireFranchiseMembership } from '../middlewares/requireFranchiseMembership'

const router = Router()

const publicSubmissionWindows = new Map<string, { count: number; resetsAt: number }>()
const limitPublicApplications = (req: Request, res: Response, next: NextFunction) => {
  const key = req.ip || 'unknown'
  const currentTime = Date.now()
  const current = publicSubmissionWindows.get(key)
  if (!current || current.resetsAt <= currentTime) {
    publicSubmissionWindows.set(key, { count: 1, resetsAt: currentTime + 15 * 60 * 1000 })
    return next()
  }
  if (current.count >= 5) {
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a few minutes and try again.',
    })
  }
  current.count += 1
  return next()
}

router.post('/auth/login', franchiseLogin)
router.get('/opportunities', getPublicFranchiseOpportunities)
router.post('/applications', limitPublicApplications, submitPublicFranchiseApplication)
router.use(requireAuth, requireFranchiseMembership)
router.get('/me', getFranchiseMe)
router.get('/dashboard', getFranchiseDashboard)
router.get('/orders', getFranchiseOrders)
router.get('/tracking', getFranchiseTracking)
router.get('/ndr', getFranchiseNdr)
router.get('/rto', getFranchiseRto)
router.get('/territories', getFranchiseTerritories)
router.get('/network', getFranchiseTerritories)
router.get('/earnings', getFranchiseEarnings)
router.get('/settlements', getFranchiseSettlements)
router.get('/payouts', getFranchiseSettlements)
router.get('/reports', getFranchiseReports)
router.get('/documents', getFranchiseDocuments)
router.get('/team', getFranchiseTeam)
router.get('/disputes', getFranchiseDisputes)
router.post('/disputes', createFranchiseDispute)

export default router
