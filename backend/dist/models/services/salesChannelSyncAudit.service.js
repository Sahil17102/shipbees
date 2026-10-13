"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalesChannelSyncCandidates = exports.recordSalesChannelSyncOutcome = exports.detectSalesChannel = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const toPlainMeta = (value) => value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
const toErrorMessage = (error) => {
    if (!error)
        return null;
    if (typeof error === 'string')
        return error.slice(0, 500);
    const err = error;
    const responseData = err?.response?.data;
    if (responseData?.message)
        return String(responseData.message).slice(0, 500);
    if (responseData?.errors?.[0]?.message)
        return String(responseData.errors[0].message).slice(0, 500);
    if (responseData)
        return JSON.stringify(responseData).slice(0, 500);
    return String(err?.message || err).slice(0, 500);
};
const detectSalesChannel = (order) => {
    const localOrderId = String(order?.order_id || '').trim();
    if (localOrderId.startsWith('shopify_'))
        return 'shopify';
    if (localOrderId.startsWith('woo_'))
        return 'woocommerce';
    return null;
};
exports.detectSalesChannel = detectSalesChannel;
const recordSalesChannelSyncOutcome = async (order, outcome, tx = client_1.db) => {
    const orderId = String(order?.id || '').trim();
    if (!orderId)
        return;
    try {
        const [freshOrder] = await tx
            .select({
            id: b2cOrders_1.b2c_orders.id,
            provider_meta: b2cOrders_1.b2c_orders.provider_meta,
            order_status: b2cOrders_1.b2c_orders.order_status,
            awb_number: b2cOrders_1.b2c_orders.awb_number,
        })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.id} = ${orderId}::uuid`)
            .limit(1);
        if (!freshOrder?.id)
            return;
        const existingMeta = toPlainMeta(freshOrder.provider_meta);
        const previousSync = toPlainMeta(existingMeta.sales_channel_sync);
        const previousAttempts = Number(previousSync.attempts || 0);
        const now = new Date().toISOString();
        const status = outcome.status;
        const completedWithoutRetry = status === 'success' || status === 'skipped';
        const syncedStatus = String(outcome.syncedStatus ?? freshOrder.order_status ?? order?.order_status ?? '');
        const syncedAwb = String(outcome.syncedAwb ?? freshOrder.awb_number ?? order?.awb_number ?? '');
        const nextSync = {
            ...previousSync,
            channel: outcome.channel,
            status,
            source: outcome.source || previousSync.source || null,
            actions: outcome.actions || [],
            reason: outcome.reason || null,
            error: status === 'failed' ? toErrorMessage(outcome.error) : null,
            attempts: completedWithoutRetry ? 0 : previousAttempts + 1,
            last_attempted_at: now,
            last_success_at: status === 'success' ? now : previousSync.last_success_at || null,
            synced_status: completedWithoutRetry ? syncedStatus : previousSync.synced_status || null,
            synced_awb: completedWithoutRetry ? syncedAwb : previousSync.synced_awb || null,
        };
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({
            provider_meta: {
                ...existingMeta,
                sales_channel_sync: nextSync,
            },
        })
            .where((0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.id} = ${orderId}::uuid`);
    }
    catch (err) {
        console.warn('Sales channel sync audit update failed:', err?.message || err);
    }
};
exports.recordSalesChannelSyncOutcome = recordSalesChannelSyncOutcome;
const getSalesChannelSyncCandidates = async ({ batchSize = 50, retryDelayMinutes = 10, recentDays = 45, tx = client_1.db, } = {}) => {
    const safeBatchSize = Math.min(Math.max(Number(batchSize) || 50, 1), 250);
    const safeRetryDelayMinutes = Math.min(Math.max(Number(retryDelayMinutes) || 10, 1), 1440);
    const safeRecentDays = Math.min(Math.max(Number(recentDays) || 45, 1), 365);
    return tx
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(b2cOrders_1.b2c_orders.order_id, 'shopify_%'), (0, drizzle_orm_1.like)(b2cOrders_1.b2c_orders.order_id, 'woo_%')), (0, drizzle_orm_1.sql) `
          lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) in (
            'booked',
            'pickup_initiated',
            'in_transit',
            'out_for_delivery',
            'delivered',
            'cancelled',
            'cancellation_requested'
          )
        `, (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.updated_at} >= now() - (${safeRecentDays}::text || ' days')::interval`, (0, drizzle_orm_1.sql) `
          (
            ${b2cOrders_1.b2c_orders.provider_meta} is null
            or ${b2cOrders_1.b2c_orders.provider_meta}->'sales_channel_sync' is null
            or ${b2cOrders_1.b2c_orders.provider_meta}->'sales_channel_sync'->>'synced_status'
              is distinct from coalesce(${b2cOrders_1.b2c_orders.order_status}, '')
            or ${b2cOrders_1.b2c_orders.provider_meta}->'sales_channel_sync'->>'synced_awb'
              is distinct from coalesce(${b2cOrders_1.b2c_orders.awb_number}, '')
            or (
              ${b2cOrders_1.b2c_orders.provider_meta}->'sales_channel_sync'->>'status' = 'failed'
              and coalesce(
                (${b2cOrders_1.b2c_orders.provider_meta}->'sales_channel_sync'->>'last_attempted_at')::timestamptz,
                to_timestamp(0)
              ) < now() - (${safeRetryDelayMinutes}::text || ' minutes')::interval
            )
          )
        `))
        .orderBy((0, drizzle_orm_1.desc)(b2cOrders_1.b2c_orders.updated_at))
        .limit(safeBatchSize);
};
exports.getSalesChannelSyncCandidates = getSalesChannelSyncCandidates;
