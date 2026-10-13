"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ekartWebhookHandler = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const courierCredentials_1 = require("../../models/schema/courierCredentials");
const schema_1 = require("../../schema/schema");
const crypto_1 = __importDefault(require("crypto"));
const EKART_WEBHOOK_SECRET_HEADERS = [
    'x-ekart-webhook-secret',
    'x-ekart-webhook-signature',
    'x-ekart-signature',
    'x-ekart-hmac-sha256',
    'x-hmac-sha256',
    'x-webhook-signature',
    'x-signature',
    'x-hub-signature-256',
];
const EKART_PROVIDER = 'ekart';
const findSecretHeader = (headers) => {
    const normalized = headers;
    for (const header of EKART_WEBHOOK_SECRET_HEADERS) {
        const value = normalized[header] || normalized[header.toLowerCase()];
        if (!value)
            continue;
        if (Array.isArray(value) && value.length)
            return String(value[0]).trim();
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
};
const timingSafeStringEqual = (left, right) => {
    const leftBuf = Buffer.from(left);
    const rightBuf = Buffer.from(right);
    return leftBuf.length === rightBuf.length && crypto_1.default.timingSafeEqual(leftBuf, rightBuf);
};
const isValidEkartSignature = (receivedSecret, configuredSecret, rawBody) => {
    if (timingSafeStringEqual(receivedSecret, configuredSecret))
        return true;
    const hmacHex = crypto_1.default.createHmac('sha256', configuredSecret).update(rawBody).digest('hex');
    const hmacBase64 = crypto_1.default.createHmac('sha256', configuredSecret).update(rawBody).digest('base64');
    const candidates = [hmacHex, `sha256=${hmacHex}`, hmacBase64, `sha256=${hmacBase64}`];
    return candidates.some((candidate) => timingSafeStringEqual(receivedSecret, candidate));
};
const sanitizeHeadersForLog = (headers) => {
    const sensitiveHeaders = new Set(EKART_WEBHOOK_SECRET_HEADERS);
    return Object.fromEntries(Object.entries(headers).map(([key, value]) => [
        key,
        sensitiveHeaders.has(key.toLowerCase()) ? '[redacted]' : value,
    ]));
};
const fetchEkartWebhookSecret = async () => {
    try {
        const [row] = await client_1.db
            .select({
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, EKART_PROVIDER))
            .limit(1);
        return (row?.webhookSecret || '').trim();
    }
    catch (err) {
        console.error('Failed to load Ekart webhook secret:', err?.message || err);
        return '';
    }
};
const ekartWebhookHandler = async (req, res) => {
    const payload = req.body;
    const configuredSecret = await fetchEkartWebhookSecret();
    const receivedSecret = findSecretHeader(req.headers);
    const rawBody = req.rawBody || (req.body ? JSON.stringify(req.body) : '');
    if (configuredSecret) {
        if (!receivedSecret) {
            console.warn('Ekart webhook rejected: missing signature header');
            return res.status(401).json({ success: false, message: 'missing signature' });
        }
        else if (!isValidEkartSignature(receivedSecret, configuredSecret, rawBody)) {
            console.warn('Ekart webhook rejected: invalid signature');
            return res.status(401).json({ success: false, message: 'invalid signature' });
        }
    }
    else if (receivedSecret) {
        console.info('Ekart webhook header received but no secret configured locally; payload will be accepted.');
    }
    const awb = payload?.tracking_id ||
        payload?.trackingId ||
        payload?.awb ||
        payload?.waybill ||
        payload?.wbn ||
        payload?.id ||
        payload?.track?.id ||
        payload?.track?.wbn ||
        payload?.track_updated?.id ||
        payload?.track_updated?.wbn ||
        payload?.barcodes?.wbn ||
        'unknown';
    console.log('='.repeat(80));
    console.log(`[Ekart] Webhook received - AWB: ${awb}`);
    console.log('Headers:', JSON.stringify(sanitizeHeadersForLog(req.headers), null, 2));
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('='.repeat(80));
    try {
        const result = await (0, webhookProcessor_1.processEkartWebhook)(payload);
        if (!result.success && result.reason === 'order_not_found') {
            const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
            const status = String(payload?.status ||
                payload?.current_status ||
                payload?.event ||
                payload?.track_updated?.status ||
                payload?.track?.status ||
                'unknown');
            const [existingPending] = await client_1.db
                .select({ id: schema_1.pending_webhooks.id })
                .from(schema_1.pending_webhooks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.awb_number, String(awb || 'unknown')), (0, drizzle_orm_1.eq)(schema_1.pending_webhooks.status, `ekart:${status}`), (0, drizzle_orm_1.isNull)(schema_1.pending_webhooks.processed_at), (0, drizzle_orm_1.gte)(schema_1.pending_webhooks.created_at, dedupeWindowStart)))
                .limit(1);
            if (!existingPending) {
                await client_1.db.insert(schema_1.pending_webhooks).values({
                    awb_number: awb || null,
                    status: `ekart:${status}`,
                    payload: {
                        __provider: 'ekart',
                        body: payload,
                    },
                });
                console.warn(`Stored Ekart webhook for AWB ${awb || 'N/A'} (order not yet created).`);
            }
            else {
                console.warn(`Duplicate pending Ekart webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`);
            }
            return res.status(202).json({ success: true, queued: true });
        }
        if (!result.success) {
            return res.status(202).json({ success: false, reason: result.reason });
        }
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Ekart webhook processing failed:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.ekartWebhookHandler = ekartWebhookHandler;
