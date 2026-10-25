import { Router } from 'express'
import {
  listInternationalRates,
  updateInternationalRate,
} from '../../controllers/admin/internationalRates.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()
router.use(requireAuth, isAdminMiddleware)
router.get('/rates', listInternationalRates)
router.put('/rates/:id', updateInternationalRate)

export default router
