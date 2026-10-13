"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackOrderController = exports.bulkDownloadOrderDocumentsController = exports.regenerateOrderDocumentsController = exports.retryFailedManifestController = exports.generateManifestController = exports.getB2BOrdersController = exports.getB2COrdersController = exports.getAllOrdersController = exports.checkOrderNumberAvailabilityController = exports.createB2BShipmentController = exports.createB2CBulkShipmentController = exports.bookExistingB2COrderController = exports.createB2CShipmentController = void 0;
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const adminOrders_service_1 = require("../models/services/adminOrders.service");
const orderDocumentDownload_service_1 = require("../models/services/orderDocumentDownload.service");
const merchantErrorMessages_1 = require("../utils/merchantErrorMessages");
const isOperationalTimeoutError = (error) => {
    const message = String(error?.message || '')
        .trim()
        .toLowerCase();
    return (error?.code === 'ECONNABORTED' ||
        error?.code === 'ETIMEDOUT' ||
        message.includes('timeout') ||
        message.includes('timed out'));
};
const createB2CShipmentController = async (req, res) => {
    try {
        const id = req.user?.sub;
        // Local order creation (via dashboard), so is_external_api = false
        console.log('[ShipmentCreate] B2C request received', {
            user_id: id || null,
            order_number: req.body?.order_number || null,
            integration_type: req.body?.integration_type || null,
            payment_type: req.body?.payment_type || null,
            courier_id: req.body?.courier_id ?? null,
            courier_partner: req.body?.courier_partner || null,
            has_amazon_request_token: Boolean(req.body?.amazon_request_token || req.body?.requestToken),
            has_amazon_rate_id: Boolean(req.body?.amazon_rate_id || req.body?.rateId),
            amazon_service_id: req.body?.amazon_service_id || null,
            amazon_carrier_id: req.body?.amazon_carrier_id || null,
        });
        // Set a longer timeout for B2C order creation (3 minutes)
        // External courier API calls (Delhivery) can take time
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Order creation timed out after 3 minutes')), 180000);
        });
        const shipmentPromise = (0, shiprocket_service_1.createB2CShipmentService)(req.body, id, false);
        const shipment = (await Promise.race([shipmentPromise, timeoutPromise]));
        res.status(200).json({ success: true, shipment });
    }
    catch (error) {
        console.error('Error creating B2C shipment:', {
            message: error?.message || 'Unknown error',
            statusCode: error?.statusCode ?? error?.response?.status ?? 500,
            code: error?.code ?? null,
            stack: error?.stack || null,
            response: error?.response?.data || null,
            request: {
                order_number: req.body?.order_number,
                integration_type: req.body?.integration_type,
                payment_type: req.body?.payment_type,
                courier_id: req.body?.courier_id ?? null,
            },
        });
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        const errorMessage = error.message?.includes('timeout') || error.code === 'ECONNABORTED'
            ? 'Order creation is taking longer than expected. Please try again or contact support if the issue persists.'
            : error.message || 'Failed to create order. Please try again.';
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
};
exports.createB2CShipmentController = createB2CShipmentController;
const bookExistingB2COrderController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orderId = String(req.params?.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, shiprocket_service_1.bookExistingB2COrderWithCourierService)(orderId, userId, req.body || {});
        return res.status(200).json({
            success: true,
            message: result.shipment?.testMode
                ? 'Development-store test shipment booked and label generated; no real courier or funds were used.'
                : 'Courier selected and shipment booked successfully',
            ...result,
        });
    }
    catch (error) {
        console.error('Error booking courier for existing B2C order:', {
            userId: req.user?.sub ?? null,
            orderId: req.params?.orderId ?? null,
            message: error?.message || 'Unknown error',
            statusCode: error?.statusCode ?? error?.response?.status ?? 500,
            response: error?.response?.data || null,
            stack: error?.stack || null,
        });
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        const errorMessage = error.message?.includes('timeout') || error.code === 'ECONNABORTED'
            ? 'Courier booking is taking longer than expected. Please try again or contact support if the issue persists.'
            : error.message || 'Failed to book courier. Please try again.';
        return res.status(statusCode).json({ success: false, message: errorMessage });
    }
};
exports.bookExistingB2COrderController = bookExistingB2COrderController;
const createB2CBulkShipmentController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
        if (!orders.length) {
            return res.status(400).json({ success: false, message: 'At least one order is required.' });
        }
        const normalizedInRequest = new Map();
        const results = [];
        for (let index = 0; index < orders.length; index += 1) {
            const order = orders[index];
            const rowNumber = Number(order?.client_row_number ?? index + 1);
            const orderNumber = String(order?.order_number ?? '').trim() || null;
            const normalizedKey = String(orderNumber || '').toLowerCase();
            if (!orderNumber && !order?.defer_booking) {
                results.push({
                    rowNumber,
                    orderNumber,
                    success: false,
                    message: 'Order ID is required.',
                });
                continue;
            }
            normalizedInRequest.set(normalizedKey, (normalizedInRequest.get(normalizedKey) ?? 0) + 1);
            if ((normalizedInRequest.get(normalizedKey) ?? 0) > 1) {
                results.push({
                    rowNumber,
                    orderNumber,
                    success: false,
                    message: `Order ID "${orderNumber}" is duplicated in this bulk upload.`,
                });
                continue;
            }
            try {
                const availability = orderNumber
                    ? await (0, shiprocket_service_1.checkMerchantOrderNumberAvailability)(userId, orderNumber)
                    : { available: true, normalizedOrderNumber: null };
                if (!availability.available) {
                    results.push({
                        rowNumber,
                        orderNumber,
                        success: false,
                        message: `Order ID "${availability.normalizedOrderNumber}" already exists for this merchant.`,
                    });
                    continue;
                }
                const shipment = order?.defer_booking
                    ? await (0, shiprocket_service_1.createB2COrderDraftService)(order, userId)
                    : await (0, shiprocket_service_1.createB2CShipmentService)(order, userId, false);
                results.push({
                    rowNumber,
                    orderNumber: shipment?.order_number ?? orderNumber,
                    success: true,
                    shipment,
                    message: order?.defer_booking
                        ? 'Order saved to New. Select Ship now when you are ready to book it.'
                        : 'Order created successfully.',
                });
            }
            catch (error) {
                console.error('Bulk B2C row create error:', {
                    rowNumber,
                    orderNumber,
                    message: error?.message || 'Unknown error',
                    statusCode: error?.statusCode ?? error?.response?.status ?? 500,
                });
                results.push({
                    rowNumber,
                    orderNumber,
                    success: false,
                    message: error?.message || 'Failed to create order.',
                });
            }
        }
        const successCount = results.filter((result) => result.success).length;
        const failedCount = results.length - successCount;
        return res.status(200).json({
            success: failedCount === 0,
            message: failedCount > 0
                ? `${successCount} orders created, ${failedCount} failed.`
                : `${successCount} orders created successfully.`,
            summary: {
                total: results.length,
                successCount,
                failedCount,
            },
            results,
        });
    }
    catch (error) {
        console.error('Error creating bulk B2C shipments:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to create bulk B2C shipments.',
        });
    }
};
exports.createB2CBulkShipmentController = createB2CBulkShipmentController;
const createB2BShipmentController = async (req, res) => {
    try {
        const userId = req.user?.sub; // Assuming you have auth middleware
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const params = req.body;
        // Basic validation (you can enhance this with Zod/Yup)
        const hasBoxes = Array.isArray(params?.boxes) && params.boxes.length > 0;
        const hasOrderItems = Array.isArray(params?.order_items) && params.order_items.length > 0;
        if (!params.order_number || !params.consignee || (!hasBoxes && !hasOrderItems)) {
            return res.status(400).json({ message: 'Invalid shipment payload' });
        }
        // Call service to create shipment (local order creation, so is_external_api = false)
        const shipmentData = await (0, shiprocket_service_1.createB2BShipmentService)(params, userId, false);
        return res.status(200).json({
            success: true,
            message: 'B2B shipment created successfully',
            shipment: shipmentData,
        });
    }
    catch (err) {
        console.error('B2B Shipment Controller Error:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        return res.status(statusCode).json({ message: err.message || 'Internal server error' });
    }
};
exports.createB2BShipmentController = createB2BShipmentController;
const checkOrderNumberAvailabilityController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orderNumber = req.query.orderNumber;
        const result = await (0, shiprocket_service_1.checkMerchantOrderNumberAvailability)(userId, orderNumber);
        return res.status(200).json({
            success: true,
            data: {
                orderNumber: result.normalizedOrderNumber,
                available: result.available,
                message: result.available
                    ? 'Order ID is available.'
                    : `Order ID "${result.normalizedOrderNumber}" already exists for this merchant.`,
            },
        });
    }
    catch (error) {
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: error?.message || 'Failed to check order ID availability.',
        });
    }
};
exports.checkOrderNumberAvailabilityController = checkOrderNumberAvailabilityController;
const getAllOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        const { orders, totalCount, totalPages, statusCounts } = await (0, shiprocket_service_1.getAllOrdersService)(userId, {
            page,
            limit,
            filters,
        });
        res.status(200).json({ success: true, orders, totalCount, totalPages, statusCounts });
    }
    catch (error) {
        console.error('Error fetching all orders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllOrdersController = getAllOrdersController;
const getB2COrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const fetchAll = String(req.query.fetchAll ?? '')
            .trim()
            .toLowerCase() === 'true';
        const limit = fetchAll
            ? Math.min(parseInt(req.query.limit, 10) || 5000, 5000)
            : Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const rawStatus = req.query.status || undefined;
        const normalizedStatus = rawStatus
            ? rawStatus
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, '_')
            : undefined;
        // Filters from query
        const filters = {
            status: normalizedStatus || undefined,
            type: req.query.type,
            courier: req.query.courier,
            warehouse: req.query.warehouse,
            productQuery: req.query.productQuery,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        const { orders, totalCount, totalPages, statusCounts } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, page, limit, filters);
        return res.status(200).json({
            success: true,
            orders,
            totalCount,
            totalPages,
            statusCounts,
        });
    }
    catch (error) {
        console.error('❌ Error fetching B2C orders', {
            userId: req?.user?.sub,
            query: req?.query,
            message: error?.message,
            stack: error?.stack,
        });
        // Detect Drizzle/PG query errors
        if (typeof error.message === 'string' && error.message.includes('Failed query')) {
            return res.status(200).json({
                success: true,
                orders: [],
                totalCount: 0,
                totalPages: 0,
            });
        }
        // Fallback generic error
        return res.status(500).json({
            success: false,
            message: 'Something went wrong while fetching orders. Please try again later.',
        });
    }
};
exports.getB2COrdersController = getB2COrdersController;
const getB2BOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            companyName: req.query.companyName, // optional B2B-specific filter
        };
        const { orders, totalCount, totalPages, statusCounts } = await (0, shiprocket_service_1.getB2BOrdersByUserService)(userId, page, limit, filters);
        res.status(200).json({ success: true, orders, totalCount, totalPages, statusCounts });
    }
    catch (error) {
        console.error('❌ Error fetching B2B orders', {
            userId: req?.user?.sub,
            query: req?.query,
            message: error?.message,
            stack: error?.stack,
        });
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getB2BOrdersController = getB2BOrdersController;
const generateManifestController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { awbs, type = 'b2c', pickup_date, pickup_time, pickup_location, expected_package_count, } = req.body;
        if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
            return res.status(400).json({ success: false, message: 'AWBs are required' });
        }
        if (!['b2c', 'b2b'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid manifest type' });
        }
        const { manifest_id, manifest_url, manifest_key, warnings } = await (0, shiprocket_service_1.generateManifestService)({
            awbs,
            type,
            userId,
            pickup_date,
            pickup_time,
            pickup_location,
            expected_package_count,
            requestId: req.requestId,
            source: 'order.generateManifestController',
        });
        return res.status(200).json({
            success: true,
            message: 'Manifest generated and saved successfully',
            manifest_id,
            manifest_url,
            manifest_key,
            warnings,
        });
    }
    catch (error) {
        console.error('❌ [Manifest] Request failed', {
            requestId: req.requestId ?? null,
            source: 'order.generateManifestController',
            userId: req.user?.sub ?? null,
            manifestType: req.body?.type ?? 'b2c',
            awbCount: Array.isArray(req.body?.awbs) ? req.body.awbs.length : 0,
            statusCode: typeof error?.statusCode === 'number' ? error.statusCode : 500,
            errorName: error?.name || null,
            message: error?.message || String(error),
            stack: error?.stack || null,
        });
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        // Don't expose internal error details, provide user-friendly message
        const rawErrorMessage = error.message?.includes('timeout') || error.code === 'ECONNABORTED'
            ? 'Manifest generation is taking longer than expected. Please try again or contact support if the issue persists.'
            : error.message || 'Failed to generate manifest. Please try again.';
        const errorMessage = (0, merchantErrorMessages_1.getMerchantSafeOperationalError)(rawErrorMessage);
        return res.status(statusCode).json({ success: false, message: errorMessage });
    }
};
exports.generateManifestController = generateManifestController;
const retryFailedManifestController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, shiprocket_service_1.retryFailedManifestService)(String(orderId), userId);
        const retryLabel = result.retry_action === 'pickup_request' ? 'Pickup retry completed successfully.' : 'Manifest retry completed successfully.';
        return res.status(200).json({
            success: true,
            message: retryLabel,
            ...result,
        });
    }
    catch (error) {
        console.error('Retry failed manifest error:', error);
        const isTimeout = isOperationalTimeoutError(error);
        const statusCode = typeof error?.statusCode === 'number'
            ? error.statusCode
            : isTimeout
                ? 504
                : 500;
        const errorMessage = isTimeout
            ? 'Manifest retry is taking longer than expected. Please try again shortly.'
            : error?.message || 'Failed to retry manifest.';
        return res.status(statusCode).json({
            success: false,
            message: (0, merchantErrorMessages_1.getMerchantSafeOperationalError)(errorMessage),
        });
    }
};
exports.retryFailedManifestController = retryFailedManifestController;
const regenerateOrderDocumentsController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orderId = String(req.params.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const regenerateLabel = typeof req.body?.regenerateLabel === 'boolean' ? req.body.regenerateLabel : true;
        const regenerateInvoice = typeof req.body?.regenerateInvoice === 'boolean' ? req.body.regenerateInvoice : true;
        const result = await (0, adminOrders_service_1.regenerateOrderDocumentsServiceAdmin)({
            orderId,
            regenerateLabel,
            regenerateInvoice,
            expectedUserId: userId,
        });
        return res.status(200).json({
            success: true,
            message: 'Order documents regenerated successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Order document regeneration failed:', error);
        const errorMessage = String(error?.message || '');
        const isOrderNotFound = errorMessage === 'Order not found';
        const isInvalidSelection = errorMessage === 'At least one document must be selected for regeneration';
        const statusCode = isOrderNotFound ? 404 : isInvalidSelection ? 400 : 500;
        return res.status(statusCode).json({
            success: false,
            message: isOrderNotFound
                ? errorMessage
                : isInvalidSelection
                    ? errorMessage
                    : 'Failed to generate order documents. Please try again.',
        });
    }
};
exports.regenerateOrderDocumentsController = regenerateOrderDocumentsController;
const bulkDownloadOrderDocumentsController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
        const documentType = String(req.body?.documentType || 'label').trim().toLowerCase();
        if (!['label', 'invoice', 'manifest'].includes(documentType)) {
            return res.status(400).json({
                success: false,
                message: 'Document type must be label, invoice, or manifest.',
            });
        }
        await (0, orderDocumentDownload_service_1.streamBulkOrderDocumentsDownload)({
            response: res,
            userId,
            orderIds,
            documentType: documentType,
            retryTransientDownloads: Boolean(req.shopifySession?.shop),
        });
        return;
    }
    catch (error) {
        if (res.headersSent) {
            console.error('Bulk document download stream failed after headers were sent:', error);
            return;
        }
        console.error('Bulk document download failed:', error);
        const hasPublicStatus = typeof error?.statusCode === 'number';
        const statusCode = hasPublicStatus ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: hasPublicStatus
                ? error?.message || 'Failed to prepare bulk document download.'
                : 'Failed to prepare bulk document download. Please try again.',
        });
    }
};
exports.bulkDownloadOrderDocumentsController = bulkDownloadOrderDocumentsController;
// export const getB2BOrdersController = async (req: Request, res: Response) => {
//   try {
//     const orders = await getAllB2BOrdersService()
//     res.status(200).json({ success: true, orders })
//   } catch (error: any) {
//     console.error('Error fetching B2B orders:', error.message)
//     res.status(500).json({ success: false, message: error.message })
//   }
// }
const trackOrderController = async (req, res) => {
    try {
        const { awb, awbs, orderNumber, contact } = req.query;
        const parseAwbList = (value) => {
            const raw = Array.isArray(value) ? value.join(',') : String(value || '');
            return Array.from(new Set(raw
                .split(/[\s,;|]+/)
                .map((item) => item.trim())
                .filter(Boolean))).slice(0, 25);
        };
        const requestedAwbs = parseAwbList(awbs || awb);
        if (requestedAwbs.length > 1 || awbs) {
            const results = await Promise.all(requestedAwbs.map(async (awbNumber) => {
                try {
                    const tracking = await (0, shiprocket_service_1.trackByAwbService)(awbNumber);
                    return { awb: awbNumber, success: true, data: tracking };
                }
                catch (error) {
                    return {
                        awb: awbNumber,
                        success: false,
                        message: error?.message || 'Tracking not found',
                    };
                }
            }));
            return res.json({
                success: true,
                data: results.find((row) => row.success)?.data || null,
                results,
                summary: {
                    total: results.length,
                    found: results.filter((row) => row.success).length,
                    failed: results.filter((row) => !row.success).length,
                },
            });
        }
        let awbNumber = awb ? String(awb) : undefined;
        if (!awbNumber && orderNumber && contact) {
            // Determine if contact is email or phone
            const contactStr = String(contact);
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr);
            const isPhone = /^\d{7,15}$/.test(contactStr);
            if (!isEmail && !isPhone) {
                return res.status(400).json({
                    success: false,
                    message: 'Contact must be a valid email or phone number',
                });
            }
            // Get the order by orderNumber + contact
            const orderData = await (0, shiprocket_service_1.trackByOrderService)({
                orderNumber: String(orderNumber),
                email: isEmail ? contactStr : undefined,
                phone: isPhone ? contactStr : undefined,
            });
            awbNumber = orderData?.awb_number ?? '';
            if (!awbNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'AWB number not found for this order',
                });
            }
        }
        if (awbNumber) {
            // Fetch full tracking info using AWB
            const trackingData = await (0, shiprocket_service_1.trackByAwbService)(awbNumber);
            return res.json({ success: true, data: trackingData });
        }
        return res.status(400).json({
            success: false,
            message: "Provide either 'awb' or ('orderNumber' with 'contact')",
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.trackOrderController = trackOrderController;
