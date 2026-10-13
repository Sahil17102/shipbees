"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoresByUserId = exports.deleteStoreById = exports.integrateWithWix = exports.integrateWithMagento = exports.integrateWithWooCommerce = void 0;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const stores_1 = require("../schema/stores");
const userService_1 = require("./userService");
const PLATFORM_API_TIMEOUT_MS = Number(process.env.PLATFORM_API_TIMEOUT_MS || 15000);
const integrateWithWooCommerce = async (storeUrl, consumerKey, consumerSecret) => {
    try {
        const response = await axios_1.default.get(`${storeUrl}/wp-json/wc/v3`, {
            auth: {
                username: consumerKey.trim(),
                password: consumerSecret.trim(),
            },
            timeout: PLATFORM_API_TIMEOUT_MS,
        });
        return {
            storeName: response.data?.name || 'WooCommerce Store',
            url: storeUrl,
        };
    }
    catch (error) {
        console.error('WooCommerce API Error:', error?.response?.data || error.message);
        throw new Error('Failed to connect to WooCommerce store');
    }
};
exports.integrateWithWooCommerce = integrateWithWooCommerce;
const integrateWithMagento = async (storeUrl, accessToken) => {
    try {
        const response = await axios_1.default.get(`${storeUrl}/rest/V1/store/storeViews`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            timeout: PLATFORM_API_TIMEOUT_MS,
        });
        return response.data;
    }
    catch (error) {
        console.error('Magento API Error:', error?.response?.data || error.message);
        throw new Error('Failed to connect to Magento store');
    }
};
exports.integrateWithMagento = integrateWithMagento;
const integrateWithWix = async (storeUrl, accessToken) => {
    try {
        const wixApiUrl = `https://www.wixapis.com/stores/v1/products`;
        const response = await axios_1.default.get(wixApiUrl, {
            headers: {
                Authorization: accessToken,
            },
            timeout: PLATFORM_API_TIMEOUT_MS,
        });
        return response.data;
    }
    catch (error) {
        console.error('Wix API Error:', error);
        throw new Error('Failed to connect to Wix store');
    }
};
exports.integrateWithWix = integrateWithWix;
const deleteStoreById = async (req, res) => {
    const { storeId } = req.params;
    const userId = req?.user?.sub;
    if (!storeId || !userId) {
        return res.status(400).json({ error: 'Missing store ID' });
    }
    try {
        const result = await client_1.db.transaction(async (tx) => {
            const [store] = await tx
                .select({ id: stores_1.stores.id, platformId: stores_1.stores.platformId })
                .from(stores_1.stores)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.id, storeId), (0, drizzle_orm_1.eq)(stores_1.stores.userId, userId)))
                .limit(1);
            if (!store)
                return { deleted: false, shopifyUninstallRequired: false };
            if (store.platformId === 1) {
                return { deleted: false, shopifyUninstallRequired: true };
            }
            await tx.delete(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.id, store.id));
            const [remaining] = await tx
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(stores_1.stores)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, store.platformId)));
            await (0, userService_1.setUserChannelIntegration)(userId, store.platformId, Number(remaining?.count || 0) > 0, tx);
            return { deleted: true, shopifyUninstallRequired: false };
        });
        if (result.shopifyUninstallRequired) {
            return res.status(409).json({
                error: 'Shopify apps must be removed through the Shopify uninstall workflow',
            });
        }
        if (!result.deleted) {
            return res.status(404).json({ error: 'Store not found' });
        }
        res.status(200).json({ message: 'Store deleted successfully' });
    }
    catch (error) {
        console.error('Failed to delete store:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.deleteStoreById = deleteStoreById;
const getStoresByUserId = async (userId) => {
    return await client_1.db
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.sql) `not (
          ${stores_1.stores.platformId} = 1
          and coalesce(${stores_1.stores.metadata}->'oauth'->>'active', 'true') = 'false'
        )`));
};
exports.getStoresByUserId = getStoresByUserId;
