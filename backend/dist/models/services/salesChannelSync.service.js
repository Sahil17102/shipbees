"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryPendingSalesChannelStatusSync = exports.syncSalesChannelStatusForLocalOrder = void 0;
const client_1 = require("../client");
const salesChannelSyncAudit_service_1 = require("./salesChannelSyncAudit.service");
const channelLabel = {
    shopify: 'Shopify',
    woocommerce: 'WooCommerce',
};
const syncSalesChannelStatusForLocalOrder = async (order, { source = 'manual', tx = client_1.db } = {}) => {
    const channel = (0, salesChannelSyncAudit_service_1.detectSalesChannel)(order);
    if (!channel) {
        return { attempted: false, success: true, channel: null, reason: 'not_a_sales_channel_order' };
    }
    if (channel === 'shopify') {
        const { syncShopifyStatusForLocalOrder } = await Promise.resolve().then(() => __importStar(require('./shopify.service')));
        return syncShopifyStatusForLocalOrder(order, tx, { source });
    }
    const { syncWooCommerceStatusForLocalOrder } = await Promise.resolve().then(() => __importStar(require('./woocommerce.service')));
    return syncWooCommerceStatusForLocalOrder(order, tx, { source });
};
exports.syncSalesChannelStatusForLocalOrder = syncSalesChannelStatusForLocalOrder;
const retryPendingSalesChannelStatusSync = async ({ batchSize = Number(process.env.SALES_CHANNEL_SYNC_RETRY_BATCH_SIZE || 50), retryDelayMinutes = Number(process.env.SALES_CHANNEL_SYNC_RETRY_DELAY_MINUTES || 10), recentDays = Number(process.env.SALES_CHANNEL_SYNC_RETRY_RECENT_DAYS || 45), tx = client_1.db, } = {}) => {
    const orders = await (0, salesChannelSyncAudit_service_1.getSalesChannelSyncCandidates)({
        batchSize,
        retryDelayMinutes,
        recentDays,
        tx,
    });
    const summary = {
        checked: orders.length,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
    };
    for (const order of orders) {
        const channel = (0, salesChannelSyncAudit_service_1.detectSalesChannel)(order);
        if (!channel) {
            summary.skipped += 1;
            continue;
        }
        try {
            const result = await (0, exports.syncSalesChannelStatusForLocalOrder)(order, {
                source: 'retry-cron',
                tx,
            });
            if (result?.attempted === false) {
                summary.skipped += 1;
                continue;
            }
            summary.attempted += 1;
            if (result?.success === false) {
                summary.failed += 1;
            }
            else {
                summary.succeeded += 1;
            }
        }
        catch (err) {
            summary.attempted += 1;
            summary.failed += 1;
            await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
                channel,
                status: 'failed',
                source: 'retry-cron',
                error: err,
            }, tx);
            console.warn(`${channelLabel[channel]} status sync failed during retry cron:`, err?.message || err);
        }
    }
    return summary;
};
exports.retryPendingSalesChannelStatusSync = retryPendingSalesChannelStatusSync;
