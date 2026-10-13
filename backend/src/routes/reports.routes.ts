import express from 'express'
import {
  exportCustomReportCsvController,
  exportShipmentReportController,
  getShipmentReportOptionsController,
  getSellerInsightsController,
} from '../controllers/reports.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

router.post('/custom-export', requireAuth, exportCustomReportCsvController)
router.post('/shipments/options', requireAuth, getShipmentReportOptionsController(false))
router.post('/shipments/export', requireAuth, exportShipmentReportController(false))
router.get('/insights', requireAuth, getSellerInsightsController)

export default router

