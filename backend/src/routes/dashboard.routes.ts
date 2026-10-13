// routes/dashboardRoutes.ts
import express from 'express'
import {
  getHomePickups,
  getDashboardPendingActions,
  getDashboardInvoiceStatus,
  getDashboardTopDestinations,
  getDashboardCourierDistribution,
  getMerchantDashboardStatsController,
} from '../controllers/dashboard.controller'
import {
  getDashboardPreferencesController,
  saveDashboardPreferencesController,
} from '../controllers/dashboardPreferences.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { getSellerTourController, updateSellerTourController } from '../controllers/sellerTour.controller'

const router = express.Router()

router.get('/incoming', requireAuth, getHomePickups)
router.get('/pending-actions', requireAuth, getDashboardPendingActions)
router.get('/invoice-status', requireAuth, getDashboardInvoiceStatus)
router.get('/top-destinations', requireAuth, getDashboardTopDestinations)
router.get('/courier-distribution', requireAuth, getDashboardCourierDistribution)
router.get('/stats', requireAuth, getMerchantDashboardStatsController)
router.get('/preferences', requireAuth, getDashboardPreferencesController)
router.post('/preferences', requireAuth, saveDashboardPreferencesController)
router.get('/tour', requireAuth, getSellerTourController)
router.post('/tour', requireAuth, updateSellerTourController)

export default router
