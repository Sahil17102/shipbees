"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shadowfaxWebhookHandler = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const schema_1 = require("../../schema/schema");
const shadowfax_service_1 = require("../../models/services/couriers/shadowfax.service");
const summarizeHeaders = (headers) => ({
    'content-type': headers['content-type'] || null,
    'user-agent': headers['user-agent'] || null,
    'x-forwarded-for': headers['x-forwarded-for'] || null,
    'x-real-ip': headers['x-real-ip'] || null,
    'x-shadowfax-secret-present': Boolean(headers['x-shadowfax-secret']),
    authorization_present: Boolean(headers['authorization']),
});
const shadowfaxWebhookHandler = async (req, res) => {
    const timestamp = new Date().toISOString();
    const rawPayload = req.body || {};
    const eventTimestamp = rawPayload?.event_timestamp ||
        rawPayload?.event_time ||
        rawPayload?.status_time ||
        rawPayload?.updated_at ||
        rawPayload?.timestamp ||
        null;
    const payload = {
        ...rawPayload,
        shadowfax_event_timestamp: eventTimestamp ? String(eventTimestamp) : null,
    };
    const awb = payload?.awb_number || payload?.client_request_id || payload?.request_id || payload?.order_id || null;
    const status = payload?.event || payload?.status || payload?.current_status || 'unknown';
    const bodyKeys = Object.keys(payload || {});
    console.log('='.repeat(80));
    console.log(`📦 [${timestamp}] Shadowfax Webhook Received`);
    console.log(`   AWB/Request: ${awb || 'N/A'}`);
    console.log(`   Status: ${status}`);
    console.log(`   Event Timestamp: ${eventTimestamp || 'N/A'}`);
    console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
    console.log(`   Headers:`, summarizeHeaders(req.headers));
    console.log(`   Body Keys:`, bodyKeys);
    console.log(`   Full Payload:`, JSON.stringify(payload, null, 2));
    console.log('='.repeat(80));
    try {
        const shadowfax = new shadowfax_service_1.ShadowfaxService();
        const configuredSecret = await shadowfax.getConfiguredWebhookSecret();
        if (configuredSecret) {
            const providedSecret = String(req.headers['x-shadowfax-secret'] || req.headers['authorization'] || '').trim();
            if (!providedSecret || !providedSecret.includes(configuredSecret)) {
                console.warn('❌ Shadowfax webhook auth validation failed', {
                    awb: awb || null,
                    status: String(status || 'unknown'),
                    eventTimestamp: eventTimestamp || null,
                    headers: summarizeHeaders(req.headers),
                });
                return res.status(401).json({ message: 'Invalid Shadowfax webhook signature' });
            }
        }
        if (!awb) {
            console.warn('❌ Shadowfax webhook missing identifier', {
                status: String(status || 'unknown'),
                eventTimestamp: eventTimestamp || null,
                bodyKeys,
            });
            return res.status(400).json({ message: 'Missing AWB/request identifier' });
        }
        const result = await (0, webhookProcessor_1.processShadowfaxWebhook)(payload);
        console.log('📦 Shadowfax webhook processed result', {
            awb: String(awb),
            status: String(status || 'unknown'),
            eventTimestamp: eventTimestamp || null,
            success: Boolean(result?.success),
            reason: result?.reason || null,
            orderType: result?.orderType || null,
        });
        if (!result.success && result.reason === 'order_not_found') {
            const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
            const [existingPending] = await client_1.db
                .select({ id: schema_1.pending_webhooks.id })
                .from(schema_1.pending_webhooks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.awb_number, String(awb)), (0, drizzle_orm_1.eq)(schema_1.pending_webhooks.status, `shadowfax:${String(status || 'unknown')}`), (0, drizzle_orm_1.isNull)(schema_1.pending_webhooks.processed_at), eventTimestamp
                ? (0, drizzle_orm_1.sql) `coalesce(${schema_1.pending_webhooks.payload}->>'shadowfax_event_timestamp', '') = ${String(eventTimestamp)}`
                : (0, drizzle_orm_1.sql) `true`, (0, drizzle_orm_1.gte)(schema_1.pending_webhooks.created_at, dedupeWindowStart)))
                .limit(1);
            if (!existingPending) {
                await client_1.db.insert(schema_1.pending_webhooks).values({
                    awb_number: String(awb),
                    status: `shadowfax:${String(status || 'unknown')}`,
                    payload,
                });
                console.log('📥 Shadowfax webhook queued in pending_webhooks', {
                    awb: String(awb),
                    status: String(status || 'unknown'),
                    eventTimestamp: eventTimestamp || null,
                });
            }
            else {
                console.log('ℹ️ Shadowfax webhook skipped duplicate pending queue insert', {
                    awb: String(awb),
                    status: String(status || 'unknown'),
                    eventTimestamp: eventTimestamp || null,
                    pendingId: existingPending.id,
                });
            }
            return res.status(202).json({ success: true, queued: true });
        }
        if (result.success) {
            console.log('✅ Shadowfax webhook completed', {
                awb: String(awb),
                status: String(status || 'unknown'),
                eventTimestamp: eventTimestamp || null,
            });
            return res.status(200).json({ success: true });
        }
        console.warn('⚠️ Shadowfax webhook returned non-success outcome', {
            awb: String(awb),
            status: String(status || 'unknown'),
            eventTimestamp: eventTimestamp || null,
            result,
        });
        return res.status(202).json({ success: false });
    }
    catch (err) {
        console.error('❌ Shadowfax webhook error:', {
            message: err?.message || String(err),
            awb: awb || null,
            status: String(status || 'unknown'),
            eventTimestamp: eventTimestamp || null,
            stack: err?.stack || null,
        });
        return res.status(500).json({ message: 'Internal Server Error' });
    }
};
exports.shadowfaxWebhookHandler = shadowfaxWebhookHandler;
