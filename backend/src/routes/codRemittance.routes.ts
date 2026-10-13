import express from 'express'
import {
  exportRemittances,
  exportSingleSettlement,
  getAvailableCodCycles,
  getCodDashboard,
  getMyCodCycle,
  getRemittances,
  getRemittanceStats,
  selectMyCodCycle,
  updateRemittance,
} from '../controllers/codRemittance.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

// All routes require authentication
router.use(requireAuth)

// Dashboard
router.get('/dashboard', getCodDashboard)

// Seller-selected cycle
router.get('/cycles', getAvailableCodCycles)
router.get('/cycle', getMyCodCycle)
router.put('/cycle', selectMyCodCycle)

// Remittances
router.get('/remittances', getRemittances)
router.get('/remittances/stats', getRemittanceStats)
router.get('/remittances/export', exportRemittances)
router.get('/remittances/:remittanceId/export', exportSingleSettlement) // Single settlement export
router.patch('/remittances/:remittanceId', updateRemittance)

export default router
