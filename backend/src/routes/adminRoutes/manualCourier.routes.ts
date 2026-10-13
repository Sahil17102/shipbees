import { Router } from 'express'
import {
  addManualTrackingEventController,
  createManualCourierController,
  getManualCourierController,
  getManualProviderOptionsController,
  getManualShipmentController,
  getManualShipmentStatsController,
  importManualCourierPincodesController,
  listManualCouriersController,
  listManualShipmentsController,
  reconcileManualProviderAwbController,
  releaseManualProviderBookingController,
  rebookManualShipmentController,
  removeManualCourierPincodeController,
  replaceManualCourierPincodesController,
  setManualShipmentModeController,
  updateManualCourierController,
} from '../../controllers/admin/manualCourier.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
import { upload } from '../../middlewares/upload'

const router = Router()
router.use(requireAuth, isAdminMiddleware)

router.get('/', listManualCouriersController)
router.post('/', createManualCourierController)
router.get('/shipments/stats', getManualShipmentStatsController)
router.get('/shipments', listManualShipmentsController)
router.get('/shipments/:id', getManualShipmentController)
router.post('/shipments/:id/manual', setManualShipmentModeController)
router.post('/shipments/:id/tracking', addManualTrackingEventController)
router.post('/shipments/:id/provider-options', getManualProviderOptionsController)
router.post('/shipments/:id/rebook', rebookManualShipmentController)
router.post('/shipments/:id/release-provider-booking', releaseManualProviderBookingController)
router.post('/shipments/:id/reconcile-awb', reconcileManualProviderAwbController)
router.get('/:id', getManualCourierController)
router.patch('/:id', updateManualCourierController)
router.put('/:id/pincodes', replaceManualCourierPincodesController)
router.post('/:id/pincodes/import', upload.single('file'), importManualCourierPincodesController)
router.delete('/:id/pincodes/:pincode', removeManualCourierPincodeController)

export default router
