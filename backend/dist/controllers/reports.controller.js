"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportShipmentReportController = exports.getShipmentReportOptionsController = exports.exportCustomReportCsvController = exports.getSellerInsightsController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const codRemittance_1 = require("../models/schema/codRemittance");
const ndr_1 = require("../models/schema/ndr");
const csv_1 = require("../utils/csv");
const shipmentReport_service_1 = require("../models/services/shipmentReport.service");
const normalizeInsightStatus = (value) => String(value || '').trim().toLowerCase();
const insightOrderLabel = (order) => order.order_number || order.order_id || order.id;
const getSellerInsightsController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const [b2cRows, b2bRows] = await Promise.all([
            client_1.db
                .select({
                id: b2cOrders_1.b2c_orders.id,
                order_number: b2cOrders_1.b2c_orders.order_number,
                order_id: b2cOrders_1.b2c_orders.order_id,
                order_status: b2cOrders_1.b2c_orders.order_status,
                order_type: b2cOrders_1.b2c_orders.order_type,
                pincode: b2cOrders_1.b2c_orders.pincode,
                courier_partner: b2cOrders_1.b2c_orders.courier_partner,
                tags: b2cOrders_1.b2c_orders.tags,
                delivery_message: b2cOrders_1.b2c_orders.delivery_message,
                provider_last_status: b2cOrders_1.b2c_orders.provider_last_status,
                created_at: b2cOrders_1.b2c_orders.created_at,
            })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)),
            client_1.db
                .select({
                id: b2bOrders_1.b2b_orders.id,
                order_number: b2bOrders_1.b2b_orders.order_number,
                order_id: b2bOrders_1.b2b_orders.order_id,
                order_status: b2bOrders_1.b2b_orders.order_status,
                order_type: b2bOrders_1.b2b_orders.order_type,
                pincode: b2bOrders_1.b2b_orders.pincode,
                courier_partner: b2bOrders_1.b2b_orders.courier_partner,
                tags: b2bOrders_1.b2b_orders.tags,
                delivery_message: b2bOrders_1.b2b_orders.delivery_message,
                provider_last_status: b2bOrders_1.b2b_orders.provider_last_status,
                created_at: b2bOrders_1.b2b_orders.created_at,
            })
                .from(b2bOrders_1.b2b_orders)
                .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId)),
        ]);
        const orders = [...b2cRows, ...b2bRows];
        const pincodeMap = new Map();
        for (const order of orders) {
            const pincode = String(order.pincode || '').trim() || 'Unknown';
            const current = pincodeMap.get(pincode) || { total: 0, incidents: 0, ndr: 0, rto: 0 };
            const orderStatus = normalizeInsightStatus(order.order_status);
            current.total += 1;
            if (orderStatus === 'ndr' || orderStatus === 'undelivered' || orderStatus.startsWith('rto_') || orderStatus === 'rto') {
                current.incidents += 1;
                if (orderStatus === 'ndr' || orderStatus === 'undelivered')
                    current.ndr += 1;
                if (orderStatus === 'rto' || orderStatus.startsWith('rto_'))
                    current.rto += 1;
            }
            pincodeMap.set(pincode, current);
        }
        const highRiskPincodes = Array.from(pincodeMap.entries())
            .filter(([, value]) => value.incidents > 0)
            .map(([pincode, value]) => ({
            pincode,
            totalOrders: value.total,
            ndrOrders: value.ndr,
            rtoOrders: value.rto,
            riskRate: value.total ? Number(((value.incidents / value.total) * 100).toFixed(2)) : 0,
        }))
            .sort((a, b) => b.riskRate - a.riskRate || b.ndrOrders + b.rtoOrders - (a.ndrOrders + a.rtoOrders))
            .slice(0, 10);
        const orderNotes = orders
            .map((order) => {
            const note = [order.delivery_message, order.provider_last_status, order.tags]
                .map((value) => String(value || '').trim())
                .filter(Boolean)
                .join(' | ');
            return note
                ? {
                    orderNumber: insightOrderLabel(order),
                    status: order.order_status || 'unknown',
                    note,
                    courier: order.courier_partner || 'Unassigned',
                    createdAt: order.created_at,
                }
                : null;
        })
            .filter(Boolean)
            .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            .slice(0, 20);
        const codOrders = orders
            .filter((order) => normalizeInsightStatus(order.order_type) === 'cod')
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 10)
            .map((order) => ({ orderNumber: insightOrderLabel(order), status: order.order_status || 'unknown', pincode: order.pincode || '', courier: order.courier_partner || 'Unassigned', createdAt: order.created_at }));
        const prepaidOrders = orders
            .filter((order) => normalizeInsightStatus(order.order_type) === 'prepaid')
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 10)
            .map((order) => ({ orderNumber: insightOrderLabel(order), status: order.order_status || 'unknown', pincode: order.pincode || '', courier: order.courier_partner || 'Unassigned', createdAt: order.created_at }));
        return res.status(200).json({
            success: true,
            data: {
                summary: {
                    highRiskPincodes: highRiskPincodes.length,
                    orderNotes: orderNotes.length,
                    codOrders: orders.filter((order) => normalizeInsightStatus(order.order_type) === 'cod').length,
                    prepaidOrders: orders.filter((order) => normalizeInsightStatus(order.order_type) === 'prepaid').length,
                },
                highRiskPincodes,
                orderNotes,
                codOrders,
                prepaidOrders,
            },
        });
    }
    catch (error) {
        console.error('[getSellerInsightsController] Error:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to load insights' });
    }
};
exports.getSellerInsightsController = getSellerInsightsController;
const FIELD_LABELS = {
    order_number: 'order_number',
    order_date: 'order_date',
    order_amount: 'order_amount',
    order_type: 'order_type',
    buyer_name: 'buyer_name',
    buyer_phone: 'buyer_phone',
    buyer_email: 'buyer_email',
    address: 'address',
    city: 'city',
    state: 'state',
    pincode: 'pincode',
    weight: 'weight',
    length: 'length',
    height: 'height',
    breadth: 'breadth',
    order_status: 'order_status',
    freight_charges: 'freight_charges',
    discount: 'discount',
    products: 'products',
    shipment_date: 'shipment_date',
    awb_number: 'awb_number',
    shipment_status: 'shipment_status',
    remittance_id: 'remittance_id',
    pickup_time: 'pickup_time',
    delivered_time: 'delivered_time',
    charged_weight: 'charged_weight',
    zone: 'zone',
    last_status_updated: 'last_status_updated',
    ndr_attempts_info: 'ndr_attempts_info',
};
const DEFAULT_FIELDS = Object.keys(FIELD_LABELS);
const parseDate = (value) => {
    if (!value)
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
};
const endOfDay = (d) => {
    const out = new Date(d);
    out.setHours(23, 59, 59, 999);
    return out;
};
const toNumber = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};
const formatProducts = (products) => {
    if (!Array.isArray(products) || products.length === 0)
        return '';
    return products
        .map((p) => {
        const name = p?.name || p?.productName || p?.box_name || 'Item';
        const qty = p?.qty ?? p?.quantity ?? 1;
        const price = toNumber(p?.price);
        return `${name} x${qty} (Rs. ${price.toFixed(2)})`;
    })
        .join(' | ');
};
const stringifyDate = (v) => {
    if (!v)
        return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime()))
        return String(v);
    return d.toISOString();
};
const getNdrAttemptSummary = (events) => {
    if (!events.length)
        return '';
    const latest = events[events.length - 1];
    const attempts = Array.from(new Set(events.map((e) => e.attempt_no).filter((x) => !!x && x.trim() !== '')));
    const attemptsText = attempts.length ? attempts.join('/') : String(events.length);
    return `Attempts: ${attemptsText}; Latest: ${latest.status}${latest.reason ? ` (${latest.reason})` : ''}`;
};
const exportCustomReportCsvController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { fromDate, toDate: toDateStr, selectedFields, } = req.body || {};
        const from = parseDate(fromDate);
        const to = parseDate(toDateStr);
        if (!from || !to) {
            return res.status(400).json({ success: false, message: 'Valid fromDate and toDate are required' });
        }
        const fields = Array.isArray(selectedFields) && selectedFields.length
            ? selectedFields.filter((f) => FIELD_LABELS[f])
            : DEFAULT_FIELDS;
        if (!fields.length) {
            return res.status(400).json({ success: false, message: 'At least one field must be selected' });
        }
        const dateClauseB2C = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.gte)(b2cOrders_1.b2c_orders.created_at, from), (0, drizzle_orm_1.lte)(b2cOrders_1.b2c_orders.created_at, endOfDay(to)));
        const dateClauseB2B = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.gte)(b2bOrders_1.b2b_orders.created_at, from), (0, drizzle_orm_1.lte)(b2bOrders_1.b2b_orders.created_at, endOfDay(to)));
        const [b2cRows, b2bRows] = await Promise.all([
            client_1.db.select().from(b2cOrders_1.b2c_orders).where(dateClauseB2C).orderBy((0, drizzle_orm_1.asc)(b2cOrders_1.b2c_orders.created_at)),
            client_1.db.select().from(b2bOrders_1.b2b_orders).where(dateClauseB2B).orderBy((0, drizzle_orm_1.asc)(b2bOrders_1.b2b_orders.created_at)),
        ]);
        const b2cIds = b2cRows.map((r) => r.id);
        const allOrderRefs = [
            ...b2cRows.map((r) => ({ orderId: r.id, orderType: 'b2c' })),
            ...b2bRows.map((r) => ({ orderId: r.id, orderType: 'b2b' })),
        ];
        const [ndrRows, remRows] = await Promise.all([
            b2cIds.length
                ? client_1.db
                    .select({
                    order_id: ndr_1.ndr_events.order_id,
                    attempt_no: ndr_1.ndr_events.attempt_no,
                    status: ndr_1.ndr_events.status,
                    reason: ndr_1.ndr_events.reason,
                    created_at: ndr_1.ndr_events.created_at,
                })
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.inArray)(ndr_1.ndr_events.order_id, b2cIds))
                    .orderBy((0, drizzle_orm_1.asc)(ndr_1.ndr_events.created_at))
                : Promise.resolve([]),
            allOrderRefs.length
                ? client_1.db
                    .select({
                    id: codRemittance_1.codRemittances.id,
                    orderId: codRemittance_1.codRemittances.orderId,
                    orderType: codRemittance_1.codRemittances.orderType,
                })
                    .from(codRemittance_1.codRemittances)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.inArray)(codRemittance_1.codRemittances.orderId, allOrderRefs.map((r) => r.orderId))))
                : Promise.resolve([]),
        ]);
        const ndrMap = new Map();
        for (const ndr of ndrRows) {
            const arr = ndrMap.get(ndr.order_id) || [];
            arr.push(ndr);
            ndrMap.set(ndr.order_id, arr);
        }
        const remMap = new Map();
        for (const rem of remRows) {
            remMap.set(`${rem.orderType}:${rem.orderId}`, rem.id);
        }
        const unifiedRows = [
            ...b2cRows.map((o) => ({ ...o, _type: 'b2c' })),
            ...b2bRows.map((o) => ({ ...o, _type: 'b2b' })),
        ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const headers = fields.map((f) => FIELD_LABELS[f]);
        const rows = unifiedRows.map((order) => {
            const ndrInfo = order._type === 'b2c' ? getNdrAttemptSummary(ndrMap.get(order.id) || []) : '';
            const remittanceId = remMap.get(`${order._type}:${order.id}`) || '';
            const deliveredTime = String(order.order_status || '').toLowerCase() === 'delivered'
                ? stringifyDate(order.updated_at || order.created_at)
                : '';
            const pickupTimeFromDetails = order?.pickup_details?.pickup_time || order?.pickup_details?.pickupTime;
            const shipmentDate = stringifyDate(order.created_at);
            const rowMap = {
                order_number: order.order_number || '',
                order_date: order.order_date || '',
                order_amount: toNumber(order.order_amount).toFixed(2),
                order_type: order.order_type || '',
                buyer_name: order.buyer_name || '',
                buyer_phone: order.buyer_phone || '',
                buyer_email: order.buyer_email || '',
                address: order.address || '',
                city: order.city || '',
                state: order.state || '',
                pincode: order.pincode || '',
                weight: toNumber(order.weight).toFixed(3),
                length: toNumber(order.length).toFixed(2),
                height: toNumber(order.height).toFixed(2),
                breadth: toNumber(order.breadth).toFixed(2),
                order_status: order.order_status || '',
                freight_charges: toNumber(order.freight_charges).toFixed(2),
                discount: toNumber(order.discount).toFixed(2),
                products: formatProducts(order.products),
                shipment_date: shipmentDate,
                awb_number: order.awb_number || '',
                shipment_status: order.order_status || '',
                remittance_id: remittanceId,
                pickup_time: pickupTimeFromDetails || '',
                delivered_time: deliveredTime,
                charged_weight: toNumber(order.charged_weight || order.weight).toFixed(3),
                zone: order.delivery_location || '',
                last_status_updated: stringifyDate(order.updated_at || order.created_at),
                ndr_attempts_info: ndrInfo,
            };
            return fields.map((f) => rowMap[f] ?? '');
        });
        const csv = (0, csv_1.buildCsv)(headers, rows);
        const filename = `custom_report_${fromDate}_to_${toDateStr}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    }
    catch (error) {
        console.error('[exportCustomReportCsvController] Error:', error);
        return res.status(500).json({ success: false, message: error?.message || 'Failed to export report' });
    }
};
exports.exportCustomReportCsvController = exportCustomReportCsvController;
const parseShipmentReportFilters = (body) => {
    const fromDate = parseDate(body?.fromDate);
    const toDate = parseDate(body?.toDate);
    if (!fromDate || !toDate)
        throw new Error('Valid fromDate and toDate are required');
    if (fromDate.getTime() > toDate.getTime())
        throw new Error('From date cannot be after to date');
    if (toDate.getTime() - fromDate.getTime() > 366 * 24 * 60 * 60 * 1000) {
        throw new Error('Shipment reports are limited to a 12-month date range');
    }
    const gstMode = body?.gstMode === 'without' ? 'without' : 'with';
    return {
        fromDate,
        toDate: endOfDay(toDate),
        courier: String(body?.courier || '').trim() || undefined,
        company: String(body?.company || '').trim() || undefined,
        gstMode,
    };
};
const shipmentReportScope = (req, admin) => ({
    userId: admin ? undefined : req.user?.sub,
});
const getShipmentReportOptionsController = (admin = false) => async (req, res) => {
    try {
        if (!admin && !req.user?.sub) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const filters = parseShipmentReportFilters(req.body);
        const data = await (0, shipmentReport_service_1.getShipmentReportOptions)(shipmentReportScope(req, admin), filters);
        return res.status(200).json({ success: true, data });
    }
    catch (error) {
        return res.status(400).json({ success: false, message: error?.message || 'Failed to load report filters' });
    }
};
exports.getShipmentReportOptionsController = getShipmentReportOptionsController;
const exportShipmentReportController = (admin = false) => async (req, res) => {
    try {
        if (!admin && !req.user?.sub) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const filters = parseShipmentReportFilters(req.body);
        const { csv } = await (0, shipmentReport_service_1.buildShipmentReportCsv)(shipmentReportScope(req, admin), filters);
        const from = String(req.body?.fromDate || '');
        const to = String(req.body?.toDate || '');
        const gst = filters.gstMode === 'with' ? 'with_gst' : 'without_gst';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="shipment_report_${from}_to_${to}_${gst}.csv"`);
        return res.status(200).send(csv);
    }
    catch (error) {
        const status = String(error?.message || '').includes('50,000') ? 413 : 400;
        return res.status(status).json({ success: false, message: error?.message || 'Failed to export shipment report' });
    }
};
exports.exportShipmentReportController = exportShipmentReportController;
