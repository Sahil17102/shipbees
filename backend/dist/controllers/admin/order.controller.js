"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProviderOrderControllerAdmin = exports.generateProviderQrControllerAdmin = exports.escalateProviderOrderControllerAdmin = exports.getProviderPodControllerAdmin = exports.updateOrderStatusControllerAdmin = exports.addManualNdrToOrderControllerAdmin = exports.regenerateOrderDocumentsControllerAdmin = exports.bookAssistedExistingOrderControllerAdmin = exports.createAssistedBookingControllerAdmin = exports.getAssistedBookingRatesControllerAdmin = exports.getAssistedBookingSellerWarehousesControllerAdmin = exports.searchAssistedBookingSellersControllerAdmin = exports.exportOrdersControllerAdmin = exports.getAllOrdersControllerAdmin = exports.exportAdminShipmentReportController = exports.getAdminShipmentReportOptionsController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const adminOrders_service_1 = require("../../models/services/adminOrders.service");
const courierIntegration_controller_1 = require("../courierIntegration.controller");
const client_1 = require("../../models/client");
const shadowfax_service_1 = require("../../models/services/couriers/shadowfax.service");
const schema_1 = require("../../schema/schema");
const csv_1 = require("../../utils/csv");
const adminOrderExportCsv_1 = require("../../utils/adminOrderExportCsv");
const reports_controller_1 = require("../reports.controller");
const adminOrderReportCsv_1 = require("../../utils/adminOrderReportCsv");
exports.getAdminShipmentReportOptionsController = (0, reports_controller_1.getShipmentReportOptionsController)(true);
exports.exportAdminShipmentReportController = (0, reports_controller_1.exportShipmentReportController)(true);
const getAllOrdersControllerAdmin = async (req, res) => {
    try {
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            userId: req.query.userId,
            pickupAlert: req.query.pickupAlert,
            assistedOnly: req.query.assistedOnly === 'true' ? true : undefined,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        const { orders, totalCount, totalPages, statusCounts } = await (0, adminOrders_service_1.getAllOrdersServiceAdmin)({
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
exports.getAllOrdersControllerAdmin = getAllOrdersControllerAdmin;
const exportOrdersControllerAdmin = async (req, res) => {
    try {
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            userId: req.query.userId,
            pickupAlert: req.query.pickupAlert,
            assistedOnly: req.query.assistedOnly === 'true' ? true : undefined,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        // Fetch all orders without pagination for export
        const { orders } = await (0, adminOrders_service_1.getAllOrdersServiceAdmin)({
            page: 1,
            limit: 100000, // Large limit to get all orders
            filters,
            sanitizeDocuments: false,
        });
        const report = String(req.query.report || 'orders').trim().toLowerCase();
        let headers = adminOrderExportCsv_1.ADMIN_ORDER_EXPORT_HEADERS;
        let rows = orders.map(adminOrderExportCsv_1.toAdminOrderExportRow);
        let filenamePrefix = 'orders_export';
        if (report === 'user-wise') {
            headers = adminOrderReportCsv_1.USER_WISE_REPORT_HEADERS;
            rows = (0, adminOrderReportCsv_1.toUserWiseReportRows)(orders);
            filenamePrefix = 'user_wise_report';
        }
        else if (report === 'order-report') {
            headers = adminOrderReportCsv_1.ORDER_REPORT_HEADERS;
            const dailyRows = (0, adminOrderReportCsv_1.toDailyOrderReportRows)(orders);
            const monthlyRows = (0, adminOrderReportCsv_1.toMonthlyOrderReportRows)(orders);
            const courierRows = (0, adminOrderReportCsv_1.toCourierOrderReportRows)(orders);
            const summaryRow = (type, row) => [
                type,
                row[0],
                row[4],
                row[5],
                row[6],
                row[7],
                row[8],
                row[9],
            ];
            rows = [
                ...dailyRows.map((row) => summaryRow('Daily', row)),
                ...monthlyRows.map((row) => summaryRow('Monthly', row)),
                ...courierRows.map((row) => summaryRow('Courier', row)),
            ];
            filenamePrefix = 'order_report';
        }
        const csv = (0, csv_1.buildCsv)(headers, rows);
        // Set headers for file download
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`);
        res.status(200).send(csv);
    }
    catch (error) {
        console.error('Error exporting orders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.exportOrdersControllerAdmin = exportOrdersControllerAdmin;
const searchAssistedBookingSellersControllerAdmin = async (req, res) => {
    try {
        const sellers = await (0, adminOrders_service_1.searchApprovedSellersForAssistedBooking)(req.query.q, Number(req.query.limit || 20));
        return res.status(200).json({ success: true, data: sellers });
    }
    catch (error) {
        console.error('Error searching assisted booking sellers:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to search sellers',
        });
    }
};
exports.searchAssistedBookingSellersControllerAdmin = searchAssistedBookingSellersControllerAdmin;
const getAssistedBookingSellerWarehousesControllerAdmin = async (req, res) => {
    try {
        const sellerId = String(req.params.sellerId || '').trim();
        if (!sellerId)
            return res.status(400).json({ success: false, message: 'Seller ID is required' });
        const warehouses = await (0, adminOrders_service_1.getSellerWarehousesForAssistedBooking)(sellerId);
        return res.status(200).json({ success: true, data: warehouses });
    }
    catch (error) {
        console.error('Error fetching assisted booking warehouses:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch warehouses',
        });
    }
};
exports.getAssistedBookingSellerWarehousesControllerAdmin = getAssistedBookingSellerWarehousesControllerAdmin;
const getAssistedBookingRatesControllerAdmin = async (req, res) => {
    try {
        const sellerId = String(req.body?.sellerId || req.query.sellerId || '').trim();
        if (!sellerId)
            return res.status(400).json({ success: false, message: 'Seller ID is required' });
        const rates = await (0, courierIntegration_controller_1.getAvailableCouriersForUserFromBody)(req.body || req.query || {}, sellerId);
        return res.status(200).json({ success: true, data: rates });
    }
    catch (error) {
        console.error('Error fetching assisted booking rates:', error?.message || error);
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to fetch seller rates',
        });
    }
};
exports.getAssistedBookingRatesControllerAdmin = getAssistedBookingRatesControllerAdmin;
const createAssistedBookingControllerAdmin = async (req, res) => {
    try {
        const sellerId = String(req.body?.sellerId || '').trim();
        if (!sellerId)
            return res.status(400).json({ success: false, message: 'Seller ID is required' });
        if (!req.body?.shipment || typeof req.body.shipment !== 'object') {
            return res.status(400).json({ success: false, message: 'Shipment payload is required' });
        }
        const shipment = await (0, adminOrders_service_1.createAssistedB2CShipmentForSeller)({
            sellerId,
            adminUserId: req.user?.sub,
            payload: req.body.shipment,
        });
        return res.status(200).json({
            success: true,
            message: 'Assisted shipment booked successfully',
            shipment,
        });
    }
    catch (error) {
        console.error('Error creating assisted booking:', {
            sellerId: req.body?.sellerId || null,
            message: error?.message || 'Unknown error',
            statusCode: error?.statusCode ?? error?.response?.status ?? 500,
            response: error?.response?.data || null,
        });
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: error?.message || 'Failed to book assisted shipment',
        });
    }
};
exports.createAssistedBookingControllerAdmin = createAssistedBookingControllerAdmin;
const bookAssistedExistingOrderControllerAdmin = async (req, res) => {
    try {
        const sellerId = String(req.body?.sellerId || '').trim();
        const orderId = String(req.params.orderId || '').trim();
        if (!sellerId)
            return res.status(400).json({ success: false, message: 'Seller ID is required' });
        if (!orderId)
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        const result = await (0, adminOrders_service_1.bookAssistedExistingB2COrderForSeller)({
            sellerId,
            orderId,
            adminUserId: req.user?.sub,
            payload: req.body?.shipment || {},
        });
        return res.status(200).json({
            success: true,
            message: 'Assisted shipment booked successfully',
            ...result,
        });
    }
    catch (error) {
        console.error('Error booking assisted existing order:', error?.message || error);
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: error?.message || 'Failed to book assisted order',
        });
    }
};
exports.bookAssistedExistingOrderControllerAdmin = bookAssistedExistingOrderControllerAdmin;
const regenerateOrderDocumentsControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const regenerateLabel = typeof req.body?.regenerateLabel === 'boolean' ? req.body.regenerateLabel : true;
        const regenerateInvoice = typeof req.body?.regenerateInvoice === 'boolean' ? req.body.regenerateInvoice : true;
        const result = await (0, adminOrders_service_1.regenerateOrderDocumentsServiceAdmin)({
            orderId,
            regenerateLabel,
            regenerateInvoice,
        });
        return res.status(200).json({
            success: true,
            message: 'Order documents regenerated successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error regenerating order documents:', error?.message || error);
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to regenerate order documents',
        });
    }
};
exports.regenerateOrderDocumentsControllerAdmin = regenerateOrderDocumentsControllerAdmin;
const addManualNdrToOrderControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, adminOrders_service_1.addManualNdrToOrderServiceAdmin)({
            orderId,
            adminUserId: req.user?.sub,
            status: req.body?.status,
            reason: req.body?.reason,
            remarks: req.body?.remarks,
            attemptNo: req.body?.attemptNo,
        });
        return res.status(200).json({
            success: true,
            message: 'NDR added successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error adding manual NDR to order:', error?.message || error);
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to add NDR to order',
        });
    }
};
exports.addManualNdrToOrderControllerAdmin = addManualNdrToOrderControllerAdmin;
const updateOrderStatusControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, adminOrders_service_1.updateOrderStatusServiceAdmin)({
            orderId,
            adminUserId: req.user?.sub,
            status: req.body?.status,
            reason: req.body?.reason,
            remarks: req.body?.remarks,
            attemptNo: req.body?.attemptNo,
        });
        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error updating order status:', error?.message || error);
        return res.status(400).json({
            success: false,
            message: error?.message || 'Failed to update order status',
        });
    }
};
exports.updateOrderStatusControllerAdmin = updateOrderStatusControllerAdmin;
const getAdminB2COrderById = async (orderId) => {
    const [order] = await client_1.db.select().from(schema_1.b2c_orders).where((0, drizzle_orm_1.eq)(schema_1.b2c_orders.id, orderId)).limit(1);
    return order || null;
};
const getProviderPodControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        const order = await getAdminB2COrderById(orderId);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
            return res.status(400).json({ success: false, message: 'Only Shadowfax POD is supported here.' });
        }
        const shadowfax = new shadowfax_service_1.ShadowfaxService();
        const reference = String(order.provider_request_id || order.provider_reference || order.awb_number || '').trim();
        const reverse = String(order.order_type || '').toLowerCase() === 'reverse' ||
            reference.toUpperCase().startsWith('R');
        const data = await shadowfax.getPodDetails([reference], reverse);
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error fetching provider POD:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to fetch provider POD' });
    }
};
exports.getProviderPodControllerAdmin = getProviderPodControllerAdmin;
const escalateProviderOrderControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        const order = await getAdminB2COrderById(orderId);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
            return res.status(400).json({ success: false, message: 'Only Shadowfax escalation is supported here.' });
        }
        const issueCategory = Number(req.body?.issue_category);
        if (!Number.isFinite(issueCategory) || issueCategory <= 0) {
            return res.status(400).json({ success: false, message: 'issue_category must be a positive number' });
        }
        const shadowfax = new shadowfax_service_1.ShadowfaxService();
        const data = await shadowfax.createEscalation({
            awb_number: String(order.awb_number || order.provider_request_id || ''),
            issue_category: issueCategory,
        });
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error escalating provider order:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to escalate provider order' });
    }
};
exports.escalateProviderOrderControllerAdmin = escalateProviderOrderControllerAdmin;
const generateProviderQrControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        const order = await getAdminB2COrderById(orderId);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
            return res.status(400).json({ success: false, message: 'Only Shadowfax QR generation is supported here.' });
        }
        const shadowfax = new shadowfax_service_1.ShadowfaxService();
        const data = await shadowfax.generateQrCode({
            awb_number: order.awb_number,
            client_request_id: order.provider_request_id || undefined,
            ...req.body,
        });
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error generating provider QR:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to generate provider QR' });
    }
};
exports.generateProviderQrControllerAdmin = generateProviderQrControllerAdmin;
const updateProviderOrderControllerAdmin = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        const order = await getAdminB2COrderById(orderId);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
            return res.status(400).json({ success: false, message: 'Only Shadowfax provider updates are supported here.' });
        }
        const shadowfax = new shadowfax_service_1.ShadowfaxService();
        const reference = String(order.provider_request_id || order.provider_reference || order.awb_number || '').trim();
        const reverse = String(order.order_type || '').toLowerCase() === 'reverse' ||
            reference.toUpperCase().startsWith('R');
        const payload = {
            awb_number: order.awb_number || undefined,
            request_id: reverse ? reference : undefined,
            client_request_id: reverse ? reference : undefined,
            client_order_id: order.order_number,
            ...req.body,
        };
        const data = reverse && Object.prototype.hasOwnProperty.call(req.body || {}, 'qc_flag')
            ? await shadowfax.updateReverseQcFlag({
                awb_number: reference,
                qc_flag: Boolean((req.body || {}).qc_flag),
                ...(req.body?.sku_id ? { sku_id: String(req.body.sku_id) } : {}),
            })
            : reverse
                ? await shadowfax.updateReverseOrder(payload)
                : await shadowfax.updateForwardOrder(payload);
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        console.error('Error updating provider order:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to update provider order' });
    }
};
exports.updateProviderOrderControllerAdmin = updateProviderOrderControllerAdmin;
