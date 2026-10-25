import { Router } from 'express'
import {
  listInternationalRates,
  updateInternationalRate,
} from '../../controllers/admin/internationalRates.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
import {
  checkInternationalServiceability,
  createInternationalServiceability,
  deleteInternationalServiceability,
  getInternationalPostalSyncStatus,
  listInternationalPostalCodes,
  listInternationalServiceability,
  startInternationalPostalSync,
  updateInternationalServiceability,
} from '../../controllers/admin/internationalServiceability.controller'

const router = Router()
router.use(requireAuth, isAdminMiddleware)
router.get('/rates', listInternationalRates)
router.put('/rates/:id', updateInternationalRate)
router.get('/serviceability', listInternationalServiceability)
router.get('/serviceability/postal-codes', listInternationalPostalCodes)
router.get('/serviceability/sync', getInternationalPostalSyncStatus)
router.post('/serviceability/sync', startInternationalPostalSync)
router.post('/serviceability', createInternationalServiceability)
router.post('/serviceability/check', checkInternationalServiceability)
router.put('/serviceability/:id', updateInternationalServiceability)
router.delete('/serviceability/:id', deleteInternationalServiceability)

export default router
