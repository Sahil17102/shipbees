"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPendingWebhooks = processPendingWebhooks;
// scripts/processPendingWebhooks.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const webhookProcessor_1 = require("../models/services/webhookProcessor");
const schema_1 = require("../schema/schema");
const MAX_EVENTS_PER_RUN = Number(process.env.PENDING_WEBHOOK_MAX_PER_RUN || 100);
const MAX_PENDING_AGE_MINUTES = Number(process.env.PENDING_WEBHOOK_MAX_AGE_MINUTES || 180);
const MAX_PENDING_DUPLICATE_RETRIES = Number(process.env.PENDING_WEBHOOK_MAX_DUPLICATE_RETRIES || 5);
let isProcessingPendingWebhooks = false;
const resolvePendingProvider = (payload, status) => payload?.__provider ||
    (String(status || '').startsWith('xpressbees:')
        ? 'xpressbees'
        : String(status || '').startsWith('shadowfax:')
            ? 'shadowfax'
            : String(status || '').startsWith('ekart:')
                ? 'ekart'
                : String(status || '').startsWith('amazon:')
                    ? 'amazon'
                    : 'delhivery');
const unwrapPendingPayload = (payload) => payload?.__provider === 'xpressbees' ||
    payload?.__provider === 'ekart' ||
    payload?.__provider === 'amazon'
    ? payload?.body || {}
    : payload;
const resolvePendingAwb = (event, rawPayload) => event.awb_number ||
    rawPayload?.Shipment?.AWB ||
    rawPayload?.AWB ||
    rawPayload?.waybill ||
    rawPayload?.awb_number ||
    rawPayload?.awb ||
    rawPayload?.trackingId ||
    rawPayload?.tracking_id ||
    rawPayload?.track_updated?.id ||
    rawPayload?.track_updated?.wbn ||
    rawPayload?.track?.id ||
    rawPayload?.track?.wbn ||
    rawPayload?.trackingNumber ||
    rawPayload?.shipmentId ||
    rawPayload?.shipment_id;
const pendingProviderLabel = (provider) => provider === 'xpressbees'
    ? 'Xpressbees'
    : provider === 'shadowfax'
        ? 'Shadowfax'
        : provider === 'ekart'
            ? 'Ekart'
            : provider === 'amazon'
                ? 'Amazon Shipping'
                : 'Delhivery';
async function processPendingWebhooks() {
    if (isProcessingPendingWebhooks) {
        console.log('⏭️ Skipping pending webhook run: previous run still in progress');
        return;
    }
    isProcessingPendingWebhooks = true;
    try {
        const events = await client_1.db
            .select()
            .from(schema_1.pending_webhooks)
            .where((0, drizzle_orm_1.isNull)(schema_1.pending_webhooks.processed_at))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.pending_webhooks.created_at))
            .limit(MAX_EVENTS_PER_RUN);
        if (!events.length) {
            return;
        }
        console.log(`🔄 Processing pending webhooks... count=${events.length}`);
        const pendingCounts = new Map();
        const pendingIdsByKey = new Map();
        for (const event of events) {
            const payload = event.payload || {};
            const provider = resolvePendingProvider(payload, event.status);
            const rawPayload = unwrapPendingPayload(payload);
            const awb = resolvePendingAwb(event, rawPayload);
            if (!awb)
                continue;
            const key = `${provider}:${String(awb)}`;
            pendingCounts.set(key, (pendingCounts.get(key) || 0) + 1);
            if (!pendingIdsByKey.has(key))
                pendingIdsByKey.set(key, []);
            pendingIdsByKey.get(key).push(event.id);
        }
        let processedCount = 0;
        let deferredCount = 0;
        let skippedCount = 0;
        let expiredCount = 0;
        const thresholdClosedKeys = new Set();
        for (const event of events) {
            const payload = event.payload || {};
            const provider = resolvePendingProvider(payload, event.status);
            const rawPayload = unwrapPendingPayload(payload);
            const awb = resolvePendingAwb(event, rawPayload);
            const pendingKey = awb ? `${provider}:${String(awb)}` : null;
            const createdAt = event.created_at ? new Date(event.created_at) : new Date();
            const ageMs = Date.now() - createdAt.getTime();
            const ageMinutes = Math.floor(ageMs / 60000);
            try {
                if (pendingKey &&
                    !thresholdClosedKeys.has(pendingKey) &&
                    Number(pendingCounts.get(pendingKey) || 0) >= MAX_PENDING_DUPLICATE_RETRIES) {
                    const duplicateCount = Number(pendingCounts.get(pendingKey) || 0);
                    const pendingIds = pendingIdsByKey.get(pendingKey) || [];
                    const deletedRows = pendingIds.length > 0
                        ? await client_1.db
                            .delete(schema_1.pending_webhooks)
                            .where((0, drizzle_orm_1.inArray)(schema_1.pending_webhooks.id, pendingIds))
                            .returning({ id: schema_1.pending_webhooks.id })
                        : [];
                    thresholdClosedKeys.add(pendingKey);
                    expiredCount += deletedRows.length;
                    console.warn(`⌛ Deleted pending webhook queue for ${pendingKey} after ${duplicateCount} repeated pending entries`);
                    continue;
                }
                const looksLikeDelhivery = provider === 'delhivery' &&
                    (!!rawPayload?.Shipment ||
                        typeof rawPayload?.waybill === 'string' ||
                        typeof rawPayload?.AWB === 'string' ||
                        typeof awb === 'string');
                const looksLikeXpressbees = provider === 'xpressbees' &&
                    (typeof rawPayload?.awb_number === 'string' ||
                        typeof rawPayload?.awb === 'string' ||
                        typeof rawPayload?.order_number === 'string' ||
                        typeof rawPayload?.order_id === 'string' ||
                        typeof awb === 'string');
                const looksLikeShadowfax = provider === 'shadowfax' &&
                    (typeof rawPayload?.awb_number === 'string' ||
                        typeof rawPayload?.client_request_id === 'string' ||
                        typeof rawPayload?.request_id === 'string' ||
                        typeof rawPayload?.order_id === 'string' ||
                        typeof awb === 'string');
                const looksLikeEkart = provider === 'ekart' &&
                    (typeof rawPayload?.tracking_id === 'string' ||
                        typeof rawPayload?.trackingId === 'string' ||
                        typeof rawPayload?.awb === 'string' ||
                        typeof rawPayload?.waybill === 'string' ||
                        typeof rawPayload?.track_updated?.id === 'string' ||
                        typeof rawPayload?.track_updated?.wbn === 'string' ||
                        typeof rawPayload?.track?.id === 'string' ||
                        typeof rawPayload?.track?.wbn === 'string' ||
                        typeof awb === 'string');
                const looksLikeAmazon = provider === 'amazon' &&
                    (typeof rawPayload?.trackingId === 'string' ||
                        typeof rawPayload?.tracking_id === 'string' ||
                        typeof rawPayload?.trackingNumber === 'string' ||
                        typeof rawPayload?.shipmentId === 'string' ||
                        typeof rawPayload?.shipment_id === 'string' ||
                        typeof rawPayload?.orderNumber === 'string' ||
                        typeof rawPayload?.order_number === 'string' ||
                        typeof awb === 'string');
                if (!looksLikeDelhivery &&
                    !looksLikeXpressbees &&
                    !looksLikeShadowfax &&
                    !looksLikeEkart &&
                    !looksLikeAmazon) {
                    console.warn(`⚠️ Skipping unsupported pending webhook ${event.id} (AWB: ${awb || 'N/A'})`);
                    skippedCount++;
                    await client_1.db
                        .update(schema_1.pending_webhooks)
                        .set({ processed_at: new Date(), status: 'skipped_unsupported' })
                        .where((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.id, event.id));
                    continue;
                }
                const result = provider === 'xpressbees'
                    ? await (0, webhookProcessor_1.processXpressbeesWebhook)(rawPayload)
                    : provider === 'shadowfax'
                        ? await (0, webhookProcessor_1.processShadowfaxWebhook)(rawPayload)
                        : provider === 'ekart'
                            ? await (0, webhookProcessor_1.processEkartWebhook)(rawPayload)
                            : provider === 'amazon'
                                ? await (0, webhookProcessor_1.processAmazonShippingTrackingWebhook)(rawPayload)
                                : await (0, webhookProcessor_1.processDelhiveryWebhook)(rawPayload);
                if (result.success) {
                    processedCount++;
                    await client_1.db
                        .update(schema_1.pending_webhooks)
                        .set({ processed_at: new Date(), status: 'processed' })
                        .where((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.id, event.id));
                    console.log(`✅ Replayed pending ${pendingProviderLabel(provider)} webhook for AWB ${awb}`);
                    continue;
                }
                // Keep in queue only while within max age and order is still not present.
                if (result.reason === 'order_not_found') {
                    if (ageMinutes >= MAX_PENDING_AGE_MINUTES) {
                        expiredCount++;
                        await client_1.db
                            .update(schema_1.pending_webhooks)
                            .set({ processed_at: new Date(), status: 'expired_order_not_found' })
                            .where((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.id, event.id));
                        console.warn(`⌛ Expired pending ${pendingProviderLabel(provider)} webhook for AWB ${awb} after ${ageMinutes}m (order still missing)`);
                    }
                    else {
                        deferredCount++;
                        console.log(`⏳ Delaying pending ${pendingProviderLabel(provider)} webhook for AWB ${awb}: order still missing`);
                    }
                    continue;
                }
                // For hard-invalid payloads, mark processed to avoid infinite retries.
                skippedCount++;
                await client_1.db
                    .update(schema_1.pending_webhooks)
                    .set({ processed_at: new Date(), status: `skipped_${result.reason || 'unknown'}` })
                    .where((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.id, event.id));
                console.warn(`⚠️ Marked pending webhook as processed for AWB ${awb} due to non-retryable reason: ${result.reason}`);
            }
            catch (error) {
                // Keep row pending on runtime failures only up to max age.
                if (ageMinutes >= MAX_PENDING_AGE_MINUTES) {
                    expiredCount++;
                    await client_1.db
                        .update(schema_1.pending_webhooks)
                        .set({ processed_at: new Date(), status: 'expired_runtime_error' })
                        .where((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.id, event.id));
                    console.error(`⌛ Expired pending webhook ${event.id} (AWB: ${awb || 'N/A'}) after runtime failures for ${ageMinutes}m`);
                }
                else {
                    deferredCount++;
                    console.error(`❌ Failed processing pending webhook ${event.id} (AWB: ${awb || 'N/A'}):`, error?.message || error);
                }
            }
        }
        console.log(`📊 Pending webhook run complete: processed=${processedCount}, deferred=${deferredCount}, skipped=${skippedCount}, expired=${expiredCount}, batch_limit=${MAX_EVENTS_PER_RUN}`);
    }
    finally {
        isProcessingPendingWebhooks = false;
    }
}
