"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.amazonShippingTrackingWebhookHealthHandler = exports.amazonShippingTrackingWebhookHandler = void 0;
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const amazonShippingWebhook_1 = require("../../config/amazonShippingWebhook");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const schema_1 = require("../../schema/schema");
const AMAZON_WEBHOOK_API_KEY_ENV_KEYS = [
    'AMAZON_SHIPPING_WEBHOOK_API_KEY',
    'AMAZON_WEBHOOK_API_KEY',
    'AMAZON_SHIPPING_WEBHOOK_SECRET',
];
const getConfiguredApiKey = () => AMAZON_WEBHOOK_API_KEY_ENV_KEYS.map((key) => String(process.env[key] || '').trim()).find(Boolean) ||
    '';
const timingSafeStringEqual = (actual, expected) => {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto_1.default.timingSafeEqual(actualBuffer, expectedBuffer);
};
const summarizeHeaders = (req) => ({
    'content-type': req.headers['content-type'] || null,
    'user-agent': req.headers['user-agent'] || null,
    'x-forwarded-for': req.headers['x-forwarded-for'] || null,
    'x-real-ip': req.headers['x-real-ip'] || null,
    'x-api-key-present': Boolean(req.get(amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER)),
});
const queuePendingAmazonWebhook = async (payload) => {
    const summary = (0, webhookProcessor_1.getAmazonShippingWebhookSummary)(payload);
    const awb = summary.trackingId || summary.shipmentId || summary.orderRef || null;
    const status = `amazon:${summary.status || summary.eventCode || 'unknown'}`;
    if (!awb) {
        return { queued: false, reason: 'missing_awb' };
    }
    const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
    const [existingPending] = await client_1.db
        .select({ id: schema_1.pending_webhooks.id })
        .from(schema_1.pending_webhooks)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.awb_number, awb), (0, drizzle_orm_1.eq)(schema_1.pending_webhooks.status, status), (0, drizzle_orm_1.isNull)(schema_1.pending_webhooks.processed_at), (0, drizzle_orm_1.gte)(schema_1.pending_webhooks.created_at, dedupeWindowStart)))
        .limit(1);
    if (existingPending) {
        return { queued: true, duplicate: true, awb, status };
    }
    await client_1.db.insert(schema_1.pending_webhooks).values({
        awb_number: awb,
        status,
        payload: {
            __provider: 'amazon',
            body: payload,
        },
    });
    return { queued: true, duplicate: false, awb, status };
};
const amazonShippingTrackingWebhookHandler = async (req, res) => {
    const configuredApiKey = getConfiguredApiKey();
    const receivedApiKey = String(req.get(amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER) || '').trim();
    const summary = (0, webhookProcessor_1.getAmazonShippingWebhookSummary)(req.body);
    console.log('[AmazonShippingWebhook] received', {
        trackingId: summary.trackingId || null,
        shipmentId: summary.shipmentId || null,
        orderRef: summary.orderRef || null,
        status: summary.status || summary.eventCode || null,
        eventTime: summary.eventTime || null,
        shippingPartyAccountId: summary.shippingPartyAccountId || null,
        ip: req.ip || req.socket.remoteAddress || null,
        headers: summarizeHeaders(req),
    });
    if (!configuredApiKey) {
        console.error('[AmazonShippingWebhook] AMAZON_SHIPPING_WEBHOOK_API_KEY is not configured');
        return res.status(503).json({
            success: false,
            message: 'Amazon Shipping webhook is not configured',
        });
    }
    if (!receivedApiKey || !timingSafeStringEqual(receivedApiKey, configuredApiKey)) {
        console.warn('[AmazonShippingWebhook] rejected invalid API key', {
            trackingId: summary.trackingId || null,
            shipmentId: summary.shipmentId || null,
        });
        return res.status(401).json({ success: false, message: 'invalid api key' });
    }
    try {
        const result = await (0, webhookProcessor_1.processAmazonShippingTrackingWebhook)(req.body);
        if (!result.success && result.reason === 'missing_awb') {
            return res.status(200).json({
                success: true,
                accepted: true,
                ignored: true,
                reason: 'missing Amazon trackingId, shipmentId, or order reference',
            });
        }
        if (!result.success && result.reason === 'order_not_found') {
            const queued = await queuePendingAmazonWebhook(req.body);
            return res.status(200).json({
                success: true,
                accepted: true,
                queued: true,
                duplicate: Boolean('duplicate' in queued && queued.duplicate),
            });
        }
        if (!result.success) {
            return res.status(202).json({ success: false, reason: result.reason || 'unknown' });
        }
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('[AmazonShippingWebhook] processing failed:', {
            message: err?.message || String(err),
            stack: err?.stack || null,
            trackingId: summary.trackingId || null,
            shipmentId: summary.shipmentId || null,
        });
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.amazonShippingTrackingWebhookHandler = amazonShippingTrackingWebhookHandler;
const amazonShippingTrackingWebhookHealthHandler = (_req, res) => res.status(200).json({
    success: true,
    provider: 'amazon-shipping',
    webhookUrl: amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_URL,
    applicationId: amazonShippingWebhook_1.AMAZON_SHIPPING_APPLICATION_ID,
    authentication: {
        type: 'api_key_header',
        headerName: amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER,
    },
});
exports.amazonShippingTrackingWebhookHealthHandler = amazonShippingTrackingWebhookHealthHandler;
