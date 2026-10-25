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
  listInternationalServiceability,
  updateInternationalServiceability,
} from '../../controllers/admin/internationalServiceability.controller'

const router = Router()
router.use(requireAuth, isAdminMiddleware)
router.get('/rates', listInternationalRates)
router.put('/rates/:id', updateInternationalRate)
router.get('/serviceability', listInternationalServiceability)
router.post('/serviceability', createInternationalServiceability)
router.post('/serviceability/check', checkInternationalServiceability)
router.put('/serviceability/:id', updateInternationalServiceability)
router.delete('/serviceability/:id', deleteInternationalServiceability)

export default router
