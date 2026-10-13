"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indiaPostWebhookHandler = exports.indiaPostWebhookHealthHandler = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const b2bOrders_1 = require("../../models/schema/b2bOrders");
const b2cOrders_1 = require("../../models/schema/b2cOrders");
const trackingEvents_service_1 = require("../../models/services/trackingEvents.service");
const schema_1 = require("../../schema/schema");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const clean = (value) => String(value ?? '').trim();
const mapStatus = (eventCode, description) => {
    const value = `${eventCode} ${description}`.toLowerCase();
    if (/(delivered|item_delivered)/.test(value))
        return 'delivered';
    if (/(return|rto).*(delivered)/.test(value))
        return 'rto_delivered';
    if (/(return|rto)/.test(value))
        return 'rto_in_transit';
    if (/(non.?delivery|undelivered|delivery failed|addressee absent)/.test(value))
        return 'ndr';
    if (/(out for delivery|item invoiced)/.test(value))
        return 'out_for_delivery';
    if (/(booked|item_book)/.test(value))
        return 'shipment_created';
    if (/(bag|dispatch|received|transit)/.test(value))
        return 'in_transit';
    return 'in_transit';
};
const requestIp = (req) => clean(req.headers['x-forwarded-for']).split(',')[0].trim() || clean(req.ip || req.socket.remoteAddress);
const isAuthorizedSource = (req) => {
    const secret = clean(process.env.INDIAPOST_WEBHOOK_SECRET);
    const supplied = clean(req.headers['x-indiapost-webhook-secret'] || req.query.secret);
    if (secret && supplied !== secret)
        return false;
    const allowedIps = clean(process.env.INDIAPOST_WEBHOOK_ALLOWED_IPS)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    return allowedIps.length === 0 || allowedIps.includes(requestIp(req));
};
const indiaPostWebhookHealthHandler = (_req, res) => res.json({ success: true, provider: 'indiapost', status: 'ready' });
exports.indiaPostWebhookHealthHandler = indiaPostWebhookHealthHandler;
const indiaPostWebhookHandler = (eventType = 'generic') => async (req, res) => {
    if (!isAuthorizedSource(req)) {
        return res.status(401).json({ success: false, message: 'Unauthorized India Post webhook source' });
    }
    const payload = req.body || {};
    const awb = clean(payload.article_number || payload.ArticleNumber || payload.barcode_no);
    const eventCode = clean(payload.event_code || payload.EventCode);
    const description = clean(payload.event_description || payload.EventDescription || payload.event);
    const customerId = clean(payload.bulk_customer_id || payload.Cust_Id);
    const configuredCustomerId = clean(process.env.INDIAPOST_CUSTOMER_ID);
    if (!/^[A-Z0-9]{5,50}$/i.test(awb)) {
        return res.status(400).json({ success: false, message: 'Valid article_number is required' });
    }
    if (configuredCustomerId && customerId && customerId !== configuredCustomerId) {
        return res.status(403).json({ success: false, message: 'India Post customer ID mismatch' });
    }
    const [b2c] = await client_1.db
        .select({ id: b2cOrders_1.b2c_orders.id, userId: b2cOrders_1.b2c_orders.user_id, status: b2cOrders_1.b2c_orders.order_status, orderNumber: b2cOrders_1.b2c_orders.order_number, courier: b2cOrders_1.b2c_orders.courier_partner, paymentType: b2cOrders_1.b2c_orders.order_type })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.provider_reference, awb)))
        .limit(1);
    const [b2b] = b2c
        ? []
        : await client_1.db
            .select({ id: b2bOrders_1.b2b_orders.id, userId: b2bOrders_1.b2b_orders.user_id, status: b2bOrders_1.b2b_orders.order_status, orderNumber: b2bOrders_1.b2b_orders.order_number, courier: b2bOrders_1.b2b_orders.courier_partner, paymentType: b2bOrders_1.b2b_orders.order_type })
            .from(b2bOrders_1.b2b_orders)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.awb_number, awb), (0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.provider_reference, awb)))
            .limit(1);
    const order = b2c || b2b;
    if (!order) {
        await client_1.db.insert(schema_1.pending_webhooks).values({
            awb_number: awb,
            status: `indiapost:${eventCode || description || 'unknown'}`,
            payload: { __provider: 'indiapost', eventType, body: payload },
        });
        return res.status(202).json({ success: true, provider: 'indiapost', eventType, queued: true });
    }
    const status = mapStatus(eventCode, description);
    const update = {
        order_status: eventType === 'booking' && status === 'in_transit' ? 'shipment_created' : status,
        delivery_message: description || eventCode,
        updated_at: new Date(),
    };
    if (b2c)
        await client_1.db.update(b2cOrders_1.b2c_orders).set(update).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
    else
        await client_1.db.update(b2bOrders_1.b2b_orders).set(update).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id));
    await (0, trackingEvents_service_1.logTrackingEvent)({
        orderId: order.id,
        userId: order.userId,
        awbNumber: awb,
        courier: 'India Post',
        statusCode: eventCode || status,
        statusText: description || status,
        location: clean(payload.event_office_name || payload.EventOfficeName),
        raw: { eventType, ...payload },
    });
    if (update.order_status === 'delivered' && order.status !== 'delivered') {
        await (0, webhookDelivery_service_1.sendWebhookEvent)(order.userId, 'order.delivered', {
            order_id: order.id,
            order_number: order.orderNumber,
            awb_number: awb,
            status: 'delivered',
            raw_status: description || eventCode,
            courier_partner: order.courier || 'India Post',
            payment_type: order.paymentType,
            delivered_at: new Date().toISOString(),
            source: 'indiapost_webhook',
        });
    }
    return res.json({ success: true, provider: 'indiapost', eventType, status: update.order_status });
};
exports.indiaPostWebhookHandler = indiaPostWebhookHandler;
