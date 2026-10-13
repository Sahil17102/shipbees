import { Router } from 'express'
import {
  addManualNdrToOrderControllerAdmin,
  bookAssistedExistingOrderControllerAdmin,
  createAssistedBookingControllerAdmin,
  escalateProviderOrderControllerAdmin,
  getAssistedBookingRatesControllerAdmin,
  getAssistedBookingSellerWarehousesControllerAdmin,
  getAllOrdersControllerAdmin,
  getProviderPodControllerAdmin,
  generateProviderQrControllerAdmin,
  exportOrdersControllerAdmin,
  regenerateOrderDocumentsControllerAdmin,
  searchAssistedBookingSellersControllerAdmin,
  updateOrderStatusControllerAdmin,
  updateProviderOrderControllerAdmin,
  getAdminShipmentReportOptionsController,
  exportAdminShipmentReportController,
} from '../../controllers/admin/order.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
const router = Router()

router.get('/all-orders', requireAuth, isAdminMiddleware, getAllOrdersControllerAdmin)
router.get('/export', requireAuth, isAdminMiddleware, exportOrdersControllerAdmin)
router.post('/shipment-reports/options', requireAuth, isAdminMiddleware, getAdminShipmentReportOptionsController)
router.post('/shipment-reports/export', requireAuth, isAdminMiddleware, exportAdminShipmentReportController)
router.get('/assisted/sellers', requireAuth, isAdminMiddleware, searchAssistedBookingSellersControllerAdmin)
router.get(
  '/assisted/sellers/:sellerId/warehouses',
  requireAuth,
  isAdminMiddleware,
  getAssistedBookingSellerWarehousesControllerAdmin,
)
router.post('/assisted/rates', requireAuth, isAdminMiddleware, getAssistedBookingRatesControllerAdmin)
router.post('/assisted/create', requireAuth, isAdminMiddleware, createAssistedBookingControllerAdmin)
router.post(
  '/assisted/:orderId/book-courier',
  requireAuth,
  isAdminMiddleware,
  bookAssistedExistingOrderControllerAdmin,
)
router.post('/:id/status', requireAuth, isAdminMiddleware, updateOrderStatusControllerAdmin)
router.post('/:id/ndr', requireAuth, isAdminMiddleware, addManualNdrToOrderControllerAdmin)
router.post('/:id/provider-update', requireAuth, isAdminMiddleware, updateProviderOrderControllerAdmin)
router.post('/:id/provider-escalate', requireAuth, isAdminMiddleware, escalateProviderOrderControllerAdmin)
router.post('/:id/provider-qr', requireAuth, isAdminMiddleware, generateProviderQrControllerAdmin)
router.get('/:id/provider-pod', requireAuth, isAdminMiddleware, getProviderPodControllerAdmin)
router.post(
  '/:id/regenerate-documents',
  requireAuth,
  isAdminMiddleware,
  regenerateOrderDocumentsControllerAdmin,
)
export default router
