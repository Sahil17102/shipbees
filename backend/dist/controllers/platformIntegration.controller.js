"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStoreIntegrations = exports.integrateMagentoStore = exports.integrateWixStore = exports.integrateWooCommerceStore = exports.integrateShopifyStore = void 0;
const PlatformIntegration_service_1 = require("../models/services/PlatformIntegration.service");
const shopify_service_1 = require("../models/services/shopify.service");
const woocommerce_service_1 = require("../models/services/woocommerce.service");
const userService_1 = require("../models/services/userService");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Enum for supported platforms
 */
var PLATFORMS;
(function (PLATFORMS) {
    PLATFORMS[PLATFORMS["SHOPIFY"] = 1] = "SHOPIFY";
    PLATFORMS[PLATFORMS["WOOCOMMERCE"] = 2] = "WOOCOMMERCE";
    PLATFORMS[PLATFORMS["AMAZON"] = 3] = "AMAZON";
    PLATFORMS[PLATFORMS["MAGENTO"] = 4] = "MAGENTO";
    PLATFORMS[PLATFORMS["WIX"] = 5] = "WIX";
})(PLATFORMS || (PLATFORMS = {}));
const logIntegrationError = (label, error) => {
    console.error(label, {
        message: error?.message || String(error),
        status: error?.response?.status,
        shopifyErrors: error?.response?.data?.errors,
    });
};
const resolveIntegrationUserId = async (req, requestedUserId) => {
    const actorUserId = req?.user?.sub;
    const targetUserId = String(requestedUserId || '').trim() || actorUserId;
    if (!actorUserId && !targetUserId)
        return '';
    if (!actorUserId || actorUserId === targetUserId)
        return targetUserId;
    const [actor] = await client_1.db.select({ role: schema_1.users.role }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, actorUserId)).limit(1);
    if (actor?.role !== 'admin') {
        const error = new Error('Admin access is required to connect a store for another user');
        error.statusCode = 403;
        throw error;
    }
    return targetUserId;
};
/**
 * Handles Shopify store integration using user-provided credentials
 */
const integrateShopifyStore = async (req, res) => {
    if (String(process.env.SHOPIFY_ALLOW_LEGACY_MANUAL_AUTH || '').toLowerCase() !== 'true') {
        return res.status(410).json({
            success: false,
            error: 'Manual Shopify Admin API token connection is no longer supported. Connect Shopify through OAuth.',
            migrationPath: '/api/integrations/shopify/oauth/start',
        });
    }
    const { storeUrl, domain, apiKey, apiSecretKey, apiSecret, clientSecret, adminApiAccessToken, accessToken, token, webhookSecret, userId: bodyUserId, targetUserId, settings, } = req.body;
    const normalizedAccessToken = adminApiAccessToken || accessToken || token;
    const normalizedSecret = webhookSecret || apiSecretKey || apiSecret || clientSecret;
    try {
        const userId = await resolveIntegrationUserId(req, targetUserId || bodyUserId);
        if ((!storeUrl && !domain) || !normalizedAccessToken || !userId) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["storeUrl/domain", "adminApiAccessToken/accessToken", "authenticated user"],
            });
        }
        const result = await (0, shopify_service_1.connectShopifyStore)({
            storeUrl: storeUrl ?? domain,
            apiKey,
            apiSecretKey: normalizedSecret,
            webhookSecret: normalizedSecret,
            adminApiAccessToken: normalizedAccessToken,
            userId,
            settings,
        });
        return res.status(200).json({
            message: "Shopify integration successful!",
            data: result.shopifyData,
            store: result.store,
            webhooks: result.webhooks,
            warning: result.warning,
        });
    }
    catch (error) {
        logIntegrationError("Error integrating Shopify:", error);
        const message = error instanceof Error
            ? error.message
            : "Failed to integrate Shopify store";
        return res.status(error?.statusCode || 500).json({
            success: false,
            error: message,
            message,
        });
    }
};
exports.integrateShopifyStore = integrateShopifyStore;
const integrateWooCommerceStore = async (req, res) => {
    const { storeUrl, consumerKey, consumerSecret, userId: bodyUserId, settings, webhookSecret, targetUserId, } = req.body;
    try {
        const userId = await resolveIntegrationUserId(req, targetUserId || bodyUserId);
        if (!storeUrl || !consumerKey || !consumerSecret || !userId) {
            return res.status(400).json({
                error: "Missing required fields",
                required: ["storeUrl", "consumerKey", "consumerSecret", "authenticated user"],
            });
        }
        const result = await (0, woocommerce_service_1.connectWooCommerceStore)({
            storeUrl,
            consumerKey,
            consumerSecret,
            userId,
            settings,
            webhookSecret,
        });
        res.status(200).json({
            message: "WooCommerce integration successful!",
            data: result.wooData,
            store: result.store,
            webhooks: result.webhooks,
            warning: result.warning,
        });
    }
    catch (error) {
        console.error("Error integrating WooCommerce:", error);
        const rawMessage = error instanceof Error
            ? error.message
            : "Failed to integrate WooCommerce store";
        const isDatabaseError = /Failed query|insert into|duplicate key|violates|invalid input syntax/i.test(rawMessage);
        const message = isDatabaseError
            ? "Failed to save WooCommerce store. Please retry after refreshing the app."
            : rawMessage;
        res.status(error?.statusCode || (isDatabaseError ? 500 : 400)).json({
            success: false,
            error: message,
            message,
        });
    }
};
exports.integrateWooCommerceStore = integrateWooCommerceStore;
const integrateWixStore = async (req, res) => {
    const { storeUrl, accessToken, userId: bodyUserId } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    if (!accessToken || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const wixData = await (0, PlatformIntegration_service_1.integrateWithWix)(storeUrl, accessToken);
        const storeId = `wix_${userId}_${storeUrl}`;
        await client_1.db.transaction(async (tx) => {
            const existing = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (!existing.length) {
                await (0, userService_1.upsertStore)({
                    id: storeId,
                    domain: storeUrl,
                    name: "Wix Store",
                    adminApiAccessToken: accessToken,
                }, PLATFORMS.WIX, userId, tx);
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, PLATFORMS.WIX, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
        });
        res.status(200).json({
            message: "Wix integration successful!",
            data: wixData,
        });
    }
    catch (error) {
        console.error("Error integrating Wix:", error);
        res.status(500).json({ error: "Failed to integrate Wix store" });
    }
};
exports.integrateWixStore = integrateWixStore;
const integrateMagentoStore = async (req, res) => {
    const { storeUrl, accessToken, userId: bodyUserId } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    if (!storeUrl || !accessToken || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const magentoData = await (0, PlatformIntegration_service_1.integrateWithMagento)(storeUrl, accessToken);
        const storeId = `magento_${userId}_${storeUrl}`;
        await client_1.db.transaction(async (tx) => {
            const existing = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (!existing.length) {
                await (0, userService_1.upsertStore)({
                    id: storeId,
                    domain: storeUrl,
                    name: "Magento Store",
                    adminApiAccessToken: accessToken,
                }, PLATFORMS.MAGENTO, userId, tx);
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, PLATFORMS.MAGENTO, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
        });
        res.status(200).json({
            message: "Magento integration successful!",
            data: magentoData,
        });
    }
    catch (error) {
        console.error("Magento integration error:", error);
        res.status(500).json({ error: "Failed to integrate Magento store" });
    }
};
exports.integrateMagentoStore = integrateMagentoStore;
const getUserStoreIntegrations = async (req, res) => {
    const userId = req.user.sub;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }
    try {
        const stores = await (0, PlatformIntegration_service_1.getStoresByUserId)(userId);
        res.status(200).json({
            success: true,
            data: stores,
        });
    }
    catch (error) {
        console.error("Error fetching store integrations:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getUserStoreIntegrations = getUserStoreIntegrations;
