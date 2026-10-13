"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const invoiceGenerator_1 = require("./invoiceGenerator");
const processPendingWebhooks_1 = require("./processPendingWebhooks");
const reconcileWalletTopups_1 = require("./reconcileWalletTopups");
const seedHolidays_1 = require("./seedHolidays");
const weightReconciliationEmails_1 = require("./weightReconciliationEmails");
const courierTracking_1 = require("./courierTracking");
const salesChannelSync_service_1 = require("../models/services/salesChannelSync.service");
const shopifyPrivacy_service_1 = require("../models/services/shopifyPrivacy.service");
const parseTrackingProviders = () => String(process.env.COURIER_TRACKING_POLL_PROVIDERS || '')
    .split(/[\s,;|]+/)
    .map((provider) => provider.trim())
    .filter(Boolean);
node_cron_1.default.schedule(process.env.COURIER_TRACKING_POLL_CRON || '*/15 * * * *', async () => {
    console.log('[Cron] Courier tracking poll');
    try {
        const result = await (0, courierTracking_1.pollCourierTracking)({
            batchSize: Number(process.env.COURIER_TRACKING_POLL_BATCH_SIZE || 50),
            providers: parseTrackingProviders(),
        });
        if (result.checked > 0) {
            console.log('[Cron] Courier tracking poll complete', result);
        }
    }
    catch (err) {
        console.error('[Cron] Courier tracking poll failed:', err);
    }
});
// Runs every 20 minutes.
node_cron_1.default.schedule('*/20 * * * *', async () => {
    console.log('[Cron] Wallet reconciliation kicking off');
    try {
        await (0, reconcileWalletTopups_1.reconcileWalletTopups)();
    }
    catch (err) {
        console.error('[Cron] Wallet reconciliation failed:', err);
    }
});
node_cron_1.default.schedule('*/1 * * * *', () => {
    (0, processPendingWebhooks_1.processPendingWebhooks)().catch((err) => console.error('Error in cron webhook processor', err));
});
node_cron_1.default.schedule(process.env.SALES_CHANNEL_SYNC_RETRY_CRON || '*/10 * * * *', async () => {
    try {
        const result = await (0, salesChannelSync_service_1.retryPendingSalesChannelStatusSync)();
        if (result.attempted > 0 || result.failed > 0) {
            console.log('[Cron] Sales channel status sync retry complete', result);
        }
    }
    catch (err) {
        console.error('[Cron] Sales channel status sync retry failed:', err);
    }
});
node_cron_1.default.schedule(process.env.SHOPIFY_PRIVACY_EXPORT_CRON || '*/5 * * * *', async () => {
    try {
        const result = await (0, shopifyPrivacy_service_1.processPendingShopifyDataRequests)({
            limit: Number(process.env.SHOPIFY_PRIVACY_EXPORT_BATCH_SIZE || 10),
        });
        if (result.attempted > 0) {
            console.log('[Cron] Shopify privacy export processing complete', result);
        }
    }
    catch (err) {
        console.error('[Cron] Shopify privacy export processing failed:', err);
    }
});
node_cron_1.default.schedule('0 2 * * *', () => (0, invoiceGenerator_1.generateAutoBillingInvoices)());
// Send daily weight reconciliation summaries at 8 AM.
node_cron_1.default.schedule('0 8 * * *', async () => {
    console.log('[Cron] Daily weight reconciliation emails starting');
    try {
        await (0, weightReconciliationEmails_1.sendDailyWeightReconciliationEmails)();
    }
    catch (err) {
        console.error('[Cron] Daily weight reconciliation emails failed:', err);
    }
});
// Send weekly weight reconciliation reports every Monday at 9 AM.
node_cron_1.default.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Weekly weight reconciliation reports starting');
    try {
        await (0, weightReconciliationEmails_1.sendWeeklyWeightReconciliationEmails)();
    }
    catch (err) {
        console.error('[Cron] Weekly weight reconciliation reports failed:', err);
    }
});
// Runs on January 1st at 12:00 AM every year.
node_cron_1.default.schedule('0 0 1 1 *', () => {
    console.log('[Cron] Holiday seeding cron triggered');
    (0, seedHolidays_1.seedHolidaysCron)().catch((err) => console.error('Error in holiday seeding cron', err));
});
