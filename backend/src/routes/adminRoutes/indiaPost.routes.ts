import { Router } from 'express'
import {
  businessParcelTariffController,
  indiaPostBookArticlesController,
  indiaPostBookArticlesFileController,
  indiaPostEventsController,
  indiaPostLabelController,
  indiaPostPincodeController,
  indiaPostTrackingController,
  speedPostTariffController,
  testIndiaPostCredentialsController,
} from '../../controllers/admin/indiaPost.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
import { upload } from '../../middlewares/upload'

const router = Router()
router.use(requireAuth, isAdminMiddleware)

router.get('/credentials/test', testIndiaPostCredentialsController)
router.post('/tariffs/speed-post', speedPostTariffController)
router.post('/tariffs/business-parcel', businessParcelTariffController)
router.get('/pincodes', indiaPostPincodeController)
router.post('/bookings', indiaPostBookArticlesController)
router.post('/bookings/:customId', indiaPostBookArticlesController)
router.post('/bookings-file', upload.single('file'), indiaPostBookArticlesFileController)
router.post('/bookings-file/:customId', upload.single('file'), indiaPostBookArticlesFileController)
router.post('/labels/domestic', indiaPostLabelController)
router.post('/events/download', indiaPostEventsController)
router.post('/tracking/bulk', indiaPostTrackingController)

export default router
