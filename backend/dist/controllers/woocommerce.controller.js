"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wooCommerceOrderWebhookController = exports.syncWooCommerceOrdersController = void 0;
const woocommerce_service_1 = require("../models/services/woocommerce.service");
const syncWooCommerceOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? 50);
        const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
        const storeId = String(req.body?.storeId ?? req.query?.storeId ?? '').trim() || undefined;
        const result = await (0, woocommerce_service_1.syncWooCommerceOrdersForUser)(userId, limit, storeId);
        return res.status(200).json({
            success: true,
            message: 'WooCommerce orders synced successfully',
            ...result,
        });
    }
    catch (error) {
        console.error('WooCommerce sync failed:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to sync WooCommerce orders',
        });
    }
};
exports.syncWooCommerceOrdersController = syncWooCommerceOrdersController;
const wooCommerceOrderWebhookController = async (req, res) => {
    try {
        const rawBody = req.body;
        const signature = String(req.headers['x-wc-webhook-signature'] || '');
        const topic = String(req.headers['x-wc-webhook-topic'] || '');
        const source = String(req.headers['x-wc-webhook-source'] || '');
        if (!rawBody || !Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ success: false, error: 'Invalid webhook payload' });
        }
        if (!source) {
            return res.status(400).json({ success: false, error: 'Missing WooCommerce webhook source' });
        }
        const isValid = await (0, woocommerce_service_1.verifyWooCommerceWebhookSignatureForSource)(rawBody, signature, source);
        if (!isValid) {
            return res.status(401).json({ success: false, error: 'Invalid WooCommerce webhook signature' });
        }
        const payload = JSON.parse(rawBody.toString('utf8') || '{}');
        const result = await (0, woocommerce_service_1.processWooCommerceWebhookOrder)(source, topic, payload);
        return res.status(200).json({ success: true, result });
    }
    catch (error) {
        console.error('WooCommerce webhook handling failed:', error);
        return res.status(500).json({
            success: false,
            error: error?.message || 'Failed to process WooCommerce webhook',
        });
    }
};
exports.wooCommerceOrderWebhookController = wooCommerceOrderWebhookController;
