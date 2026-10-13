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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncWooCommerceTrackingNoteForLocalOrder = exports.syncWooCommerceStatusForLocalOrder = exports.resolveWooCommerceBookingPaymentForLocalOrder = exports.processWooCommerceWebhookOrder = exports.verifyWooCommerceWebhookSignatureForSource = exports.syncExistingWooCommerceOrdersForUser = exports.syncWooCommerceOrdersForUser = exports.connectWooCommerceStore = exports.ensureWooCommerceOrderWebhooks = exports.probeWooCommerceStore = exports.normalizeWooCommerceUrl = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const stores_1 = require("../schema/stores");
const courierProvider_1 = require("../../utils/courierProvider");
const orderLabels_1 = require("../../utils/orderLabels");
const salesChannelSyncAudit_service_1 = require("./salesChannelSyncAudit.service");
const userService_1 = require("./userService");
const WOOCOMMERCE_PLATFORM_ID = 2;
const WOOCOMMERCE_PLATFORM = {
    id: WOOCOMMERCE_PLATFORM_ID,
    name: 'WooCommerce',
    slug: 'woocommerce',
};
const WOOCOMMERCE_API_TIMEOUT_MS = Number(process.env.PLATFORM_API_TIMEOUT_MS || 15000);
const WOOCOMMERCE_WEBHOOK_TOPICS = ['order.created', 'order.updated', 'order.deleted'];
const DEFAULT_WOOCOMMERCE_SYNC_SETTINGS = {
    autoUpdateStatus: true,
    autoUpdateShipmentStatus: true,
    markCodPaid: false,
    historicalTerminalSyncDays: 10,
};
const normalizeWooHistoricalImportDays = (value) => {
    const rawDays = Number(value);
    if (!Number.isFinite(rawDays))
        return DEFAULT_WOOCOMMERCE_SYNC_SETTINGS.historicalTerminalSyncDays;
    return Math.min(Math.max(Math.trunc(rawDays), 1), 3650);
};
const normalizeWooCommerceSettings = (settings) => {
    const rawSettings = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
    return {
        ...DEFAULT_WOOCOMMERCE_SYNC_SETTINGS,
        ...rawSettings,
        historicalTerminalSyncDays: normalizeWooHistoricalImportDays(rawSettings.historicalTerminalSyncDays),
    };
};
const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const normalizeAddressPart = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const buildCompleteWooCommerceAddress = (address) => {
    const parts = [
        address?.address_1,
        address?.address_2,
        address?.city,
        address?.state,
        address?.postcode,
        address?.country,
    ]
        .map(normalizeAddressPart)
        .filter(Boolean);
    const uniqueParts = parts.filter((part, index) => {
        const normalizedPart = part.toLowerCase();
        return parts.findIndex((candidate) => candidate.toLowerCase() === normalizedPart) === index;
    });
    return uniqueParts.join(', ') || 'Address not provided';
};
const buildWooCommerceAddressParts = (address) => {
    const line1 = normalizeAddressPart(address?.address_1);
    const line2 = normalizeAddressPart(address?.address_2);
    const locality = normalizeAddressPart(address?.city);
    return {
        addressLine1: line1,
        addressLine2: line2,
        addressLocality: locality,
        fullAddress: buildCompleteWooCommerceAddress(address),
    };
};
const normalizeLabelSensitiveValue = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const hasLabelSensitiveWooOrderChange = (existing, updatePayload) => [
    'buyer_name',
    'buyer_phone',
    'buyer_email',
    'address',
    'address_line_1',
    'address_line_2',
    'address_landmark',
    'address_locality',
    'city',
    'state',
    'country',
    'pincode',
].some((field) => normalizeLabelSensitiveValue(existing[field]) !==
    normalizeLabelSensitiveValue(updatePayload[field]));
const shouldInvalidateWooCommerceLabel = (existing, updatePayload) => {
    const label = String(existing.label || '').trim();
    return Boolean(label && !(0, orderLabels_1.isExternalLabelReference)(label) && hasLabelSensitiveWooOrderChange(existing, updatePayload));
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sanitizeStoreName = (name, storeUrl) => {
    const fallback = new URL((0, exports.normalizeWooCommerceUrl)(storeUrl)).hostname || 'WooCommerce Store';
    return String(name || fallback || 'WooCommerce Store').trim().slice(0, 255);
};
const normalizeWooCommerceUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withProtocol.replace(/\/+$/, '');
};
exports.normalizeWooCommerceUrl = normalizeWooCommerceUrl;
const getWooApiBase = (storeUrl) => `${(0, exports.normalizeWooCommerceUrl)(storeUrl)}/wp-json/wc/v3`;
const generateWooStoreId = (userId, storeUrl) => {
    const hash = crypto
        .createHash('sha1')
        .update(`${userId}:${(0, exports.normalizeWooCommerceUrl)(storeUrl).toLowerCase()}`)
        .digest('hex')
        .slice(0, 32);
    return `woo_${hash}`;
};
const buildInternalWooOrderId = (storeId, wooOrderId) => `woo_${String(storeId || '').trim()}_${String(wooOrderId || '').trim()}`.slice(0, 100);
const buildWooCommerceOrderNumber = (orderNumber) => String(orderNumber || '').trim().slice(0, 50);
const parseInternalWooOrderId = (localOrderId) => {
    const match = String(localOrderId || '').match(/^woo_(woo_[a-f0-9]{32})_(.+)$/i);
    if (!match)
        return {};
    return { storeId: match[1], wooOrderId: match[2] };
};
const getWebhookAddress = () => {
    const baseUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('API_URL is not configured for WooCommerce webhook registration');
    }
    return `${baseUrl}/api/webhook/woocommerce/orders`;
};
const getWooAuth = (consumerKey, consumerSecret) => ({
    username: String(consumerKey || '').trim(),
    password: String(consumerSecret || '').trim(),
});
const wooRequest = async ({ storeUrl, consumerKey, consumerSecret, method, path, data, params, }) => {
    const baseURL = getWooApiBase(storeUrl);
    try {
        const response = await axios_1.default.request({
            baseURL,
            method,
            url: path,
            data,
            params,
            auth: getWooAuth(consumerKey, consumerSecret),
            timeout: WOOCOMMERCE_API_TIMEOUT_MS,
        });
        return response.data;
    }
    catch (err) {
        const status = Number(err?.response?.status || 0);
        const canUseQueryStringAuth = (0, exports.normalizeWooCommerceUrl)(storeUrl).toLowerCase().startsWith('https://') &&
            (status === 401 || status === 403);
        if (!canUseQueryStringAuth)
            throw err;
        const response = await axios_1.default.request({
            baseURL,
            method,
            url: path,
            data,
            params: {
                ...(params || {}),
                consumer_key: String(consumerKey || '').trim(),
                consumer_secret: String(consumerSecret || '').trim(),
            },
            timeout: WOOCOMMERCE_API_TIMEOUT_MS,
        });
        return response.data;
    }
};
const probeWooCommerceStore = async (storeUrl, consumerKey, consumerSecret) => {
    const normalizedUrl = (0, exports.normalizeWooCommerceUrl)(storeUrl);
    try {
        const systemStatus = await wooRequest({
            storeUrl: normalizedUrl,
            consumerKey,
            consumerSecret,
            method: 'get',
            path: '/system_status',
        });
        const environment = systemStatus?.environment || {};
        return {
            storeName: environment?.site_title ||
                environment?.site_url ||
                new URL(normalizedUrl).hostname,
            url: normalizedUrl,
            currency: systemStatus?.settings?.currency || systemStatus?.currency || null,
            raw: systemStatus,
        };
    }
    catch (err) {
        const message = err?.response?.data?.message ||
            err?.response?.data?.errors?.[0]?.message ||
            err?.message ||
            'Failed to connect to WooCommerce store';
        console.error('WooCommerce API Error:', err?.response?.data || err?.message || err);
        throw new Error(message);
    }
};
exports.probeWooCommerceStore = probeWooCommerceStore;
const getStoreWebhookSecret = (store) => {
    const metadata = (store?.metadata || {});
    return String(metadata.wooWebhookSecret || metadata.webhookSecret || process.env.WOOCOMMERCE_WEBHOOK_SECRET || '').trim();
};
const getWooStoresForUser = async (userId, tx = client_1.db) => {
    const rows = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID)));
    return rows;
};
const getWooStoreForUser = async (userId, storeId, tx = client_1.db) => {
    const whereClause = storeId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID), (0, drizzle_orm_1.eq)(stores_1.stores.id, storeId))
        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID));
    const [store] = await tx.select().from(stores_1.stores).where(whereClause).limit(1);
    return store;
};
const getWooStoreByUrl = async (storeUrl, tx = client_1.db) => {
    const normalizedUrl = (0, exports.normalizeWooCommerceUrl)(storeUrl).toLowerCase();
    const rows = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID));
    return rows.find((store) => (0, exports.normalizeWooCommerceUrl)(store.domain).toLowerCase() === normalizedUrl);
};
const ensureWooCommerceOrderWebhooks = async (store) => {
    const address = getWebhookAddress();
    const secret = getStoreWebhookSecret(store);
    if (!secret)
        throw new Error('WooCommerce webhook secret is missing for this store');
    const existing = await wooRequest({
        storeUrl: store.domain,
        consumerKey: store.apiKey,
        consumerSecret: store.adminApiAccessToken,
        method: 'get',
        path: '/webhooks',
        params: { per_page: 100 },
    });
    const existingByTopicAndAddress = new Map((Array.isArray(existing) ? existing : []).map((webhook) => [
        `${String(webhook?.topic || '').toLowerCase()}::${String(webhook?.delivery_url || '')}`,
        webhook,
    ]));
    const subscribed = [];
    for (const topic of WOOCOMMERCE_WEBHOOK_TOPICS) {
        const key = `${topic.toLowerCase()}::${address}`;
        const existingWebhook = existingByTopicAndAddress.get(key);
        if (existingWebhook?.id) {
            await wooRequest({
                storeUrl: store.domain,
                consumerKey: store.apiKey,
                consumerSecret: store.adminApiAccessToken,
                method: 'put',
                path: `/webhooks/${encodeURIComponent(existingWebhook.id)}`,
                data: {
                    status: 'active',
                    secret,
                },
            });
            subscribed.push(topic);
            continue;
        }
        await wooRequest({
            storeUrl: store.domain,
            consumerKey: store.apiKey,
            consumerSecret: store.adminApiAccessToken,
            method: 'post',
            path: '/webhooks',
            data: {
                name: `Shipray ${topic}`,
                topic,
                delivery_url: address,
                secret,
                status: 'active',
            },
        });
        subscribed.push(topic);
    }
    return { address, subscribed };
};
exports.ensureWooCommerceOrderWebhooks = ensureWooCommerceOrderWebhooks;
const connectWooCommerceStore = async ({ storeUrl, consumerKey, consumerSecret, userId, settings, webhookSecret, tx = client_1.db, }) => {
    const normalizedUrl = (0, exports.normalizeWooCommerceUrl)(storeUrl);
    const normalizedConsumerKey = String(consumerKey || '').trim();
    const normalizedConsumerSecret = String(consumerSecret || '').trim();
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUrl)
        throw new Error('WooCommerce store URL is required');
    if (!uuidPattern.test(normalizedUserId))
        throw new Error('A valid authenticated user is required');
    if (!normalizedConsumerKey.startsWith('ck_'))
        throw new Error('WooCommerce Consumer Key must start with ck_');
    if (!normalizedConsumerSecret.startsWith('cs_'))
        throw new Error('WooCommerce Consumer Secret must start with cs_');
    const wooData = await (0, exports.probeWooCommerceStore)(normalizedUrl, normalizedConsumerKey, normalizedConsumerSecret);
    const secret = String(webhookSecret || '').trim() ||
        crypto.randomBytes(32).toString('hex');
    const normalizedSettings = normalizeWooCommerceSettings(settings);
    let savedStore;
    await tx.transaction(async (innerTx) => {
        await (0, userService_1.ensurePlatformRegistration)(WOOCOMMERCE_PLATFORM, innerTx);
        const existingGlobalStore = await getWooStoreByUrl(normalizedUrl, innerTx);
        if (existingGlobalStore && existingGlobalStore.userId !== normalizedUserId) {
            throw new Error('This WooCommerce store is already connected to another merchant account');
        }
        const userStores = await getWooStoresForUser(normalizedUserId, innerTx);
        const existingByDomain = userStores.find((store) => (0, exports.normalizeWooCommerceUrl)(store.domain).toLowerCase() === normalizedUrl.toLowerCase());
        const storeId = existingByDomain?.id || generateWooStoreId(normalizedUserId, normalizedUrl);
        const existingMetadata = existingByDomain?.metadata && typeof existingByDomain.metadata === 'object'
            ? { ...existingByDomain.metadata }
            : {};
        const storeMetadata = {
            ...existingMetadata,
            wooWebhookSecret: secret,
            storeInfo: wooData.raw,
            ...(existingByDomain?.id && !existingMetadata.wooInitialHistoricalImportCompletedAt
                ? { wooInitialHistoricalImportCompletedAt: existingMetadata.wooInitialHistoricalImportCompletedAt || new Date().toISOString() }
                : {}),
        };
        if (existingByDomain?.id) {
            await innerTx
                .update(stores_1.stores)
                .set({
                name: sanitizeStoreName(wooData.storeName, normalizedUrl),
                domain: normalizedUrl,
                apiKey: normalizedConsumerKey,
                adminApiAccessToken: normalizedConsumerSecret,
                settings: normalizedSettings,
                currency: wooData.currency || null,
                metadata: storeMetadata,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(stores_1.stores.id, storeId));
        }
        else {
            await innerTx.insert(stores_1.stores).values({
                id: storeId,
                name: sanitizeStoreName(wooData.storeName, normalizedUrl),
                userId: normalizedUserId,
                domain: normalizedUrl,
                platformId: WOOCOMMERCE_PLATFORM_ID,
                apiKey: normalizedConsumerKey,
                adminApiAccessToken: normalizedConsumerSecret,
                settings: normalizedSettings,
                currency: wooData.currency || null,
                metadata: storeMetadata,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
        await (0, userService_1.updateUserChannelIntegration)(normalizedUserId, WOOCOMMERCE_PLATFORM_ID, innerTx);
        [savedStore] = await innerTx.select().from(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.id, storeId)).limit(1);
    });
    let webhooks = null;
    let warning = null;
    try {
        if (savedStore)
            webhooks = await (0, exports.ensureWooCommerceOrderWebhooks)(savedStore);
    }
    catch (err) {
        warning = 'Store connected, but WooCommerce webhooks could not be auto-configured';
        console.warn('WooCommerce webhook setup failed:', err?.response?.data || err?.message || err);
    }
    return { wooData, store: savedStore, webhooks, warning };
};
exports.connectWooCommerceStore = connectWooCommerceStore;
const mapWooCommerceStatus = (order) => {
    const status = String(order?.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'failed' || status === 'refunded')
        return 'cancelled';
    if (status === 'completed')
        return 'delivered';
    return 'pending';
};
const WOO_TERMINAL_STATUSES = new Set([
    'completed',
    'delivered',
    'cancelled',
    'canceled',
    'refunded',
    'failed',
    'trash',
]);
const WOO_ACTIONABLE_SYNC_STATUSES = ['pending', 'processing', 'on-hold'];
const isWooCommerceActionableStatus = (status) => WOO_ACTIONABLE_SYNC_STATUSES.includes(String(status || '').trim().toLowerCase());
const resolveWooOrderCreatedAt = (order) => {
    const rawValue = String(order?.date_created_gmt || order?.date_created || '').trim();
    if (!rawValue)
        return null;
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const hasWooCompletedInitialHistoricalImport = (store) => Boolean(store?.metadata?.wooInitialHistoricalImportCompletedAt ||
    store?.metadata?.wooInitialHistoricalImportCompleted);
const markWooInitialHistoricalImportCompleted = async (store, tx = client_1.db) => {
    const currentMetadata = store?.metadata && typeof store.metadata === 'object' ? { ...store.metadata } : {};
    await tx
        .update(stores_1.stores)
        .set({
        metadata: {
            ...currentMetadata,
            wooInitialHistoricalImportCompletedAt: currentMetadata.wooInitialHistoricalImportCompletedAt || new Date().toISOString(),
        },
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(stores_1.stores.id, store.id));
};
const getWooTerminalHistoryCutoff = (store, options = {}) => {
    const settings = normalizeWooCommerceSettings(store?.settings || {});
    const historicalDays = Number(settings.historicalTerminalSyncDays);
    const now = new Date();
    const historicalCutoff = new Date(now.getTime() - historicalDays * 24 * 60 * 60 * 1000);
    if (options.allowBeforeConnectionHistory)
        return historicalCutoff;
    const connectionDate = new Date(store?.createdAt || Date.now());
    return connectionDate > historicalCutoff ? connectionDate : historicalCutoff;
};
const shouldImportWooCommerceOrder = (store, order, options = {}) => {
    if (options.existingOrderId)
        return true;
    const status = String(order?.status || '').trim().toLowerCase();
    return isWooCommerceActionableStatus(status);
};
const resolveWooOrderPaymentDecision = (order) => {
    const status = String(order?.status || '').trim().toLowerCase();
    const paymentMethod = String(order?.payment_method || '').trim().toLowerCase();
    const paymentMethodTitle = String(order?.payment_method_title || '').trim();
    const combinedPaymentMethod = [paymentMethod, paymentMethodTitle.toLowerCase()].filter(Boolean).join(' ');
    if (combinedPaymentMethod.includes('cod') || combinedPaymentMethod.includes('cash')) {
        return {
            confirmationStatus: 'confirmed',
            orderType: 'cod',
            paymentMethod,
            paymentMethodTitle,
            resolutionSource: 'payment_method',
            status,
        };
    }
    if (paymentMethod || paymentMethodTitle) {
        return {
            confirmationStatus: 'confirmed',
            orderType: 'prepaid',
            paymentMethod,
            paymentMethodTitle,
            resolutionSource: 'payment_method',
            status,
        };
    }
    return {
        confirmationStatus: 'unconfirmed',
        orderType: ['processing', 'completed'].includes(status) ? 'prepaid' : 'cod',
        paymentMethod,
        paymentMethodTitle,
        resolutionSource: 'status_fallback',
        status,
    };
};
const resolveWooOrderType = (order) => {
    return resolveWooOrderPaymentDecision(order).orderType;
};
const normalizeProviderMetaObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return value;
};
const buildWooCommercePaymentMeta = (order, decision) => ({
    sales_channel_payment: {
        provider: 'woocommerce',
        confirmationStatus: decision.confirmationStatus,
        orderType: decision.orderType,
        resolutionSource: decision.resolutionSource,
        paymentMethod: decision.paymentMethod || null,
        paymentMethodTitle: decision.paymentMethodTitle || null,
        status: decision.status || null,
        orderId: order?.id ? String(order.id) : null,
        syncedAt: new Date().toISOString(),
    },
});
const readWooCommercePaymentMeta = (order) => {
    const meta = normalizeProviderMetaObject(order?.provider_meta);
    const paymentMeta = normalizeProviderMetaObject(meta.sales_channel_payment);
    const confirmationStatus = String(paymentMeta.confirmationStatus || '').trim().toLowerCase();
    const orderType = String(paymentMeta.orderType || '').trim().toLowerCase();
    const resolutionSource = String(paymentMeta.resolutionSource || '').trim().toLowerCase();
    if (!['confirmed', 'unconfirmed'].includes(confirmationStatus))
        return null;
    if (!['cod', 'prepaid'].includes(orderType))
        return null;
    if (!['payment_method', 'status_fallback'].includes(resolutionSource))
        return null;
    return {
        confirmationStatus: confirmationStatus,
        orderType: orderType,
        paymentMethod: String(paymentMeta.paymentMethod || '').trim().toLowerCase(),
        paymentMethodTitle: String(paymentMeta.paymentMethodTitle || '').trim(),
        resolutionSource: resolutionSource,
        status: String(paymentMeta.status || '').trim().toLowerCase(),
    };
};
const mapWooProducts = (order) => {
    const items = Array.isArray(order?.line_items) ? order.line_items : [];
    return items.map((item) => {
        const qty = Math.max(1, toNumber(item?.quantity, 1));
        const total = toNumber(item?.total, 0);
        const subtotal = toNumber(item?.subtotal, total);
        const tax = toNumber(item?.total_tax, 0);
        return {
            name: item?.name || 'Item',
            sku: item?.sku || String(item?.product_id || item?.id || 'NA'),
            qty,
            price: toNumber(item?.price, qty > 0 ? subtotal / qty : subtotal),
            discount: Math.max(0, subtotal - total),
            tax_rate: total > 0 && tax > 0 ? Number(((tax / total) * 100).toFixed(2)) : 0,
            hsn: '',
        };
    });
};
const hasAddressFields = (address) => Boolean(address &&
    (address.address_1 ||
        address.address_2 ||
        address.city ||
        address.state ||
        address.postcode ||
        address.first_name ||
        address.last_name ||
        address.company));
const getAddress = (order) => {
    const shipping = order?.shipping || {};
    const billing = order?.billing || {};
    return hasAddressFields(shipping) ? shipping : billing;
};
const upsertFromWooCommerceOrder = async (store, order, tx = client_1.db, options = {}) => {
    if (!order?.id)
        return 'skipped';
    const wooOrderId = String(order.id);
    const internalOrderId = buildInternalWooOrderId(store.id, wooOrderId);
    const paymentDecision = resolveWooOrderPaymentDecision(order);
    const orderType = paymentDecision.orderType;
    const orderAmount = toNumber(order?.total, 0);
    const shippingAddress = getAddress(order);
    const products = mapWooProducts(order);
    const shippingCharges = Array.isArray(order?.shipping_lines)
        ? order.shipping_lines.reduce((sum, item) => sum + toNumber(item?.total, 0), 0)
        : toNumber(order?.shipping_total, 0);
    const salesChannelPaymentMeta = buildWooCommercePaymentMeta(order, paymentDecision);
    const addressParts = buildWooCommerceAddressParts(shippingAddress);
    const updatePayload = {
        user_id: store.userId,
        order_number: buildWooCommerceOrderNumber(wooOrderId),
        order_date: String(order?.date_created || order?.date_created_gmt || new Date().toISOString()).slice(0, 50),
        order_amount: orderAmount,
        order_id: internalOrderId,
        invoice_number: String(wooOrderId).slice(0, 100),
        invoice_date: order?.date_created ? String(order.date_created).slice(0, 50) : null,
        invoice_amount: orderAmount,
        buyer_name: String(`${shippingAddress?.first_name || ''} ${shippingAddress?.last_name || ''}`.trim() ||
            shippingAddress?.company ||
            order?.billing?.email ||
            'WooCommerce Customer').slice(0, 255),
        buyer_phone: String(order?.billing?.phone || shippingAddress?.phone || '0000000000').slice(0, 20),
        buyer_email: String(order?.billing?.email || '').slice(0, 255) || null,
        address: addressParts.fullAddress.slice(0, 500),
        address_line_1: addressParts.addressLine1.slice(0, 255) || null,
        address_line_2: addressParts.addressLine2.slice(0, 255) || null,
        address_landmark: null,
        address_locality: addressParts.addressLocality.slice(0, 255) || null,
        city: String(shippingAddress?.city || 'NA').slice(0, 100),
        state: String(shippingAddress?.state || 'NA').slice(0, 100),
        country: String(shippingAddress?.country || 'India').slice(0, 100),
        pincode: String(shippingAddress?.postcode || '000000').slice(0, 20),
        products: products.length ? products : [{ name: 'Item', sku: 'NA', qty: 1, price: orderAmount }],
        weight: 500,
        length: 10,
        breadth: 10,
        height: 10,
        order_type: orderType,
        prepaid_amount: orderType === 'prepaid' ? orderAmount : 0,
        cod_charges: 0,
        shipping_charges: shippingCharges,
        transaction_fee: 0,
        gift_wrap: 0,
        discount: toNumber(order?.discount_total, 0),
        order_status: mapWooCommerceStatus(order),
        courier_partner: '',
        integration_type: 'woocommerce',
        is_external_api: false,
        tags: `woocommerce_store:${store.id}`,
        provider_meta: salesChannelPaymentMeta,
        updated_at: new Date(),
    };
    const [existing] = await tx
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_status: b2cOrders_1.b2c_orders.order_status,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        integration_type: b2cOrders_1.b2c_orders.integration_type,
        provider_meta: b2cOrders_1.b2c_orders.provider_meta,
        provider_service: b2cOrders_1.b2c_orders.provider_service,
        label: b2cOrders_1.b2c_orders.label,
        buyer_name: b2cOrders_1.b2c_orders.buyer_name,
        buyer_phone: b2cOrders_1.b2c_orders.buyer_phone,
        buyer_email: b2cOrders_1.b2c_orders.buyer_email,
        address: b2cOrders_1.b2c_orders.address,
        address_line_1: b2cOrders_1.b2c_orders.address_line_1,
        address_line_2: b2cOrders_1.b2c_orders.address_line_2,
        address_landmark: b2cOrders_1.b2c_orders.address_landmark,
        address_locality: b2cOrders_1.b2c_orders.address_locality,
        city: b2cOrders_1.b2c_orders.city,
        state: b2cOrders_1.b2c_orders.state,
        country: b2cOrders_1.b2c_orders.country,
        pincode: b2cOrders_1.b2c_orders.pincode,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, internalOrderId))
        .limit(1);
    if (!shouldImportWooCommerceOrder(store, order, {
        existingOrderId: existing?.id,
        allowBeforeConnectionHistory: options.allowBeforeConnectionHistory,
    })) {
        return 'skipped';
    }
    if (existing?.id) {
        const mergedProviderMeta = {
            ...normalizeProviderMetaObject(existing.provider_meta),
            ...salesChannelPaymentMeta,
            sales_channel_payment: salesChannelPaymentMeta.sales_channel_payment,
        };
        const providerMetaCourierName = (0, courierProvider_1.getProviderMetaCourierName)(existing.provider_meta);
        const invalidateGeneratedLabel = shouldInvalidateWooCommerceLabel(existing, updatePayload);
        const bookedProviderKey = existing.awb_number
            ? (0, courierProvider_1.resolveCourierProviderKeyFromFields)(existing.integration_type, existing.courier_partner, providerMetaCourierName, existing.provider_service)
            : '';
        const updateBookedPayload = existing.awb_number
            ? {
                ...updatePayload,
                provider_meta: mergedProviderMeta,
                order_status: String(updatePayload.order_status || '').toLowerCase() === 'cancelled'
                    ? updatePayload.order_status
                    : existing.order_status || updatePayload.order_status,
                courier_partner: providerMetaCourierName ||
                    (bookedProviderKey ? (0, courierProvider_1.getCourierProviderDisplayName)(bookedProviderKey) : '') ||
                    existing.courier_partner ||
                    updatePayload.courier_partner,
                integration_type: bookedProviderKey || existing.integration_type || updatePayload.integration_type,
                ...(invalidateGeneratedLabel ? { label: null } : {}),
            }
            : {
                ...updatePayload,
                provider_meta: mergedProviderMeta,
                ...(invalidateGeneratedLabel ? { label: null } : {}),
            };
        await tx.update(b2cOrders_1.b2c_orders).set(updateBookedPayload).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, existing.id));
        return 'updated';
    }
    await tx.insert(b2cOrders_1.b2c_orders).values({ ...updatePayload, created_at: new Date() });
    return 'created';
};
const syncWooCommerceOrdersForUser = async (userId, limit = 50, storeId, tx = client_1.db) => {
    const storesToSync = storeId
        ? [await getWooStoreForUser(userId, storeId, tx)].filter(Boolean)
        : await getWooStoresForUser(userId, tx);
    if (!storesToSync.length) {
        throw new Error('No connected WooCommerce store found for this user');
    }
    const result = { created: 0, updated: 0, skipped: 0 };
    for (const store of storesToSync) {
        const perPage = Math.min(Math.max(limit, 1), 100);
        const actionableOrders = [];
        let page = 1;
        const allowBeforeConnectionHistory = !hasWooCompletedInitialHistoricalImport(store);
        while (actionableOrders.length < perPage) {
            const orders = await wooRequest({
                storeUrl: store.domain,
                consumerKey: store.apiKey,
                consumerSecret: store.adminApiAccessToken,
                method: 'get',
                path: '/orders',
                params: {
                    per_page: perPage,
                    page,
                    status: WOO_ACTIONABLE_SYNC_STATUSES.join(','),
                    orderby: 'modified',
                    order: 'desc',
                },
            });
            const currentPageOrders = Array.isArray(orders) ? orders : [];
            if (!currentPageOrders.length)
                break;
            actionableOrders.push(...currentPageOrders.filter((order) => shouldImportWooCommerceOrder(store, order, { allowBeforeConnectionHistory })));
            if (currentPageOrders.length < perPage)
                break;
            page += 1;
        }
        for (const order of actionableOrders.slice(0, perPage)) {
            const state = await upsertFromWooCommerceOrder(store, order, tx, { allowBeforeConnectionHistory });
            result[state] += 1;
        }
        if (allowBeforeConnectionHistory) {
            await markWooInitialHistoricalImportCompleted(store, tx);
        }
    }
    return result;
};
exports.syncWooCommerceOrdersForUser = syncWooCommerceOrdersForUser;
const syncExistingWooCommerceOrdersForUser = async (userId, limit = 1000, storeId, tx = client_1.db) => {
    const storesToSync = storeId
        ? [await getWooStoreForUser(userId, storeId, tx)].filter(Boolean)
        : await getWooStoresForUser(userId, tx);
    if (!storesToSync.length) {
        throw new Error('No connected WooCommerce store found for this user');
    }
    const perStoreLimit = Math.min(Math.max(Math.trunc(Number(limit) || 1000), 1), 5000);
    const result = { checked: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const store of storesToSync) {
        const internalOrderPrefix = buildInternalWooOrderId(store.id, '');
        const rows = await tx
            .select({
            id: b2cOrders_1.b2c_orders.id,
            orderId: b2cOrders_1.b2c_orders.order_id,
            providerMeta: b2cOrders_1.b2c_orders.provider_meta,
        })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, store.userId), (0, drizzle_orm_1.like)(b2cOrders_1.b2c_orders.order_id, `${internalOrderPrefix}%`)))
            .limit(perStoreLimit);
        for (const row of rows) {
            const parsed = parseInternalWooOrderId(String(row.orderId || ''));
            if (!parsed.wooOrderId) {
                result.skipped += 1;
                continue;
            }
            try {
                const liveOrder = await wooRequest({
                    storeUrl: store.domain,
                    consumerKey: store.apiKey,
                    consumerSecret: store.adminApiAccessToken,
                    method: 'get',
                    path: `/orders/${encodeURIComponent(parsed.wooOrderId)}`,
                });
                result.checked += 1;
                const paymentDecision = resolveWooOrderPaymentDecision(liveOrder);
                const salesChannelPaymentMeta = buildWooCommercePaymentMeta(liveOrder, paymentDecision);
                const orderAmount = toNumber(liveOrder?.total, 0);
                const mergedProviderMeta = {
                    ...normalizeProviderMetaObject(row.providerMeta),
                    ...salesChannelPaymentMeta,
                    sales_channel_payment: salesChannelPaymentMeta.sales_channel_payment,
                };
                await tx
                    .update(b2cOrders_1.b2c_orders)
                    .set({
                    order_type: paymentDecision.orderType,
                    prepaid_amount: paymentDecision.orderType === 'prepaid' ? orderAmount : 0,
                    provider_meta: mergedProviderMeta,
                    updated_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, row.id));
                result.updated += 1;
            }
            catch (err) {
                result.failed += 1;
                console.warn('WooCommerce existing order payment refresh failed:', {
                    storeId: store.id,
                    orderId: row.orderId,
                    message: err?.response?.data?.message || err?.message || String(err),
                });
            }
        }
    }
    return result;
};
exports.syncExistingWooCommerceOrdersForUser = syncExistingWooCommerceOrdersForUser;
const verifyWebhookSignature = (rawBody, receivedSignature, secret) => {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const expected = Buffer.from(digest);
    const received = Buffer.from(String(receivedSignature || ''));
    if (expected.length !== received.length)
        return false;
    return crypto.timingSafeEqual(expected, received);
};
const verifyWooCommerceWebhookSignatureForSource = async (rawBody, receivedSignature, sourceUrl, tx = client_1.db) => {
    const store = await getWooStoreByUrl(sourceUrl, tx);
    if (!store)
        return false;
    const secret = getStoreWebhookSecret(store);
    if (!secret)
        return false;
    return verifyWebhookSignature(rawBody, receivedSignature, secret);
};
exports.verifyWooCommerceWebhookSignatureForSource = verifyWooCommerceWebhookSignatureForSource;
const processWooCommerceWebhookOrder = async (sourceUrl, topic, payload, tx = client_1.db) => {
    const store = await getWooStoreByUrl(sourceUrl, tx);
    if (!store)
        return { success: false, reason: 'store_not_found' };
    const normalizedTopic = String(topic || '').toLowerCase();
    if (normalizedTopic.includes('order.created') || normalizedTopic.includes('order.updated')) {
        const action = await upsertFromWooCommerceOrder(store, payload, tx);
        return { success: true, action };
    }
    if (normalizedTopic.includes('order.deleted')) {
        const internalOrderId = buildInternalWooOrderId(store.id, payload?.id || '');
        if (!payload?.id)
            return { success: false, reason: 'missing_order_id' };
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({ order_status: 'cancelled', updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, internalOrderId));
        return { success: true, action: 'cancelled' };
    }
    return { success: true, action: 'ignored_topic' };
};
exports.processWooCommerceWebhookOrder = processWooCommerceWebhookOrder;
const resolveWooCommerceBookingPaymentForLocalOrder = async (order, tx = client_1.db) => {
    const localOrderId = String(order?.order_id || '');
    if (!localOrderId.startsWith('woo_')) {
        return null;
    }
    const parsed = parseInternalWooOrderId(localOrderId);
    if (!parsed.storeId || !parsed.wooOrderId) {
        return readWooCommercePaymentMeta(order);
    }
    const [store] = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.id, parsed.storeId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID)))
        .limit(1);
    if (!store) {
        return readWooCommercePaymentMeta(order);
    }
    try {
        const liveOrder = await wooRequest({
            storeUrl: store.domain,
            consumerKey: store.apiKey,
            consumerSecret: store.adminApiAccessToken,
            method: 'get',
            path: `/orders/${encodeURIComponent(parsed.wooOrderId)}`,
        });
        return resolveWooOrderPaymentDecision(liveOrder);
    }
    catch (err) {
        const stored = readWooCommercePaymentMeta(order);
        if (stored)
            return stored;
        throw err;
    }
};
exports.resolveWooCommerceBookingPaymentForLocalOrder = resolveWooCommerceBookingPaymentForLocalOrder;
const buildWooCommerceSyncNote = (orderStatus, awb, courierPartner) => `Shipray update: ${orderStatus}. AWB: ${awb}. Courier: ${courierPartner || 'Courier'}.`;
const ensureWooCommerceSyncNote = async ({ store, wooOrderId, note, }) => {
    const existingNotes = await wooRequest({
        storeUrl: store.domain,
        consumerKey: store.apiKey,
        consumerSecret: store.adminApiAccessToken,
        method: 'get',
        path: `/orders/${encodeURIComponent(wooOrderId)}/notes`,
        params: { per_page: 50 },
    });
    const alreadyExists = (Array.isArray(existingNotes) ? existingNotes : []).some((existingNote) => String(existingNote?.note || '')
        .replace(/<[^>]*>/g, '')
        .includes(note));
    if (alreadyExists)
        return false;
    await wooRequest({
        storeUrl: store.domain,
        consumerKey: store.apiKey,
        consumerSecret: store.adminApiAccessToken,
        method: 'post',
        path: `/orders/${encodeURIComponent(wooOrderId)}/notes`,
        data: {
            note,
            customer_note: false,
        },
    });
    return true;
};
const WOO_STATUS_SYNC_ALLOWED_SOURCES = new Set([
    'courier-booking',
    'retry-cron',
    'manual',
]);
const WOO_STATUS_SYNC_RETRYABLE_STATUSES = new Set([
    'booked',
    'pickup_initiated',
]);
const WOO_STATUS_TRACKING_ONLY_SOURCES = new Set([
    'live-tracking',
    'delhivery_webhook',
    'ekart_webhook',
    'xpressbees_webhook',
    'amazon_shipping_webhook',
    'shadowfax_webhook',
]);
const getPreviousSalesChannelSyncSource = (order) => String(order?.provider_meta?.sales_channel_sync?.source || '').trim().toLowerCase();
const WOO_CANCEL_STATUS_BLOCKING_STATUSES = new Set([
    'pickup_initiated',
    'picked',
    'pickup_done',
    'in_transit',
    'out_for_delivery',
    'ofd',
    'ndr',
    'undelivered',
    'delivered',
    'rto',
    'rto_initiated',
    'rto_in_transit',
    'rto_delivered',
    'lost',
]);
const hasWooShipmentMovementEvidence = (order) => {
    const awb = String(order?.awb_number || '').trim();
    if (awb)
        return true;
    return [order?.pickup_status, order?.provider_last_status, order?.delivery_message]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .some((status) => {
        if (WOO_CANCEL_STATUS_BLOCKING_STATUSES.has(status))
            return true;
        return (status.includes('pickup') ||
            status.includes('picked') ||
            status.includes('transit') ||
            status.includes('ofd') ||
            status.includes('out_for_delivery') ||
            status.includes('undelivered') ||
            status.includes('ndr') ||
            status.includes('delivered') ||
            status.includes('rto') ||
            status.includes('return') ||
            status.includes('lost'));
    });
};
const isWooCommerceStatusSyncAllowed = (orderStatus, source, previousSyncSource) => {
    const normalizedStatus = String(orderStatus || '').trim().toLowerCase();
    if (normalizedStatus === 'cancelled')
        return true;
    const normalizedSource = String(source || '').trim().toLowerCase();
    const normalizedPreviousSource = String(previousSyncSource || '').trim().toLowerCase();
    if (WOO_STATUS_TRACKING_ONLY_SOURCES.has(normalizedSource) ||
        WOO_STATUS_TRACKING_ONLY_SOURCES.has(normalizedPreviousSource)) {
        return false;
    }
    if (normalizedSource === 'retry-cron' || normalizedSource === 'manual') {
        return WOO_STATUS_SYNC_RETRYABLE_STATUSES.has(normalizedStatus);
    }
    return WOO_STATUS_SYNC_ALLOWED_SOURCES.has(normalizedSource);
};
const persistWooCommerceTrackingNote = async (order, tx, options = {}) => {
    const localOrderId = String(order?.order_id || '');
    if (!localOrderId.startsWith('woo_')) {
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'not_a_woocommerce_order' };
    }
    const parsed = parseInternalWooOrderId(localOrderId);
    if (!parsed.storeId || !parsed.wooOrderId) {
        return { attempted: false, success: false, channel: 'woocommerce', reason: 'missing_woocommerce_order_id' };
    }
    const orderStatus = String(order?.order_status || '').toLowerCase();
    const awb = String(order?.awb_number || '').trim();
    const [store] = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.id, parsed.storeId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID)))
        .limit(1);
    if (!store) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'skipped',
            source: options.source,
            reason: 'store_not_found',
            syncedStatus: String(order?.order_status || '').toLowerCase(),
            syncedAwb: String(order?.awb_number || '').trim(),
        }, tx);
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'store_not_found' };
    }
    const settings = normalizeWooCommerceSettings((store?.settings || {}));
    if (!settings.autoUpdateShipmentStatus || !awb) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'skipped',
            source: options.source,
            reason: !settings.autoUpdateShipmentStatus ? 'shipment_notes_disabled' : 'awb_missing',
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return {
            attempted: false,
            success: true,
            channel: 'woocommerce',
            reason: !settings.autoUpdateShipmentStatus ? 'shipment_notes_disabled' : 'awb_missing',
        };
    }
    const note = buildWooCommerceSyncNote(orderStatus || 'tracking_updated', awb, order?.courier_partner);
    try {
        const created = await ensureWooCommerceSyncNote({
            store,
            wooOrderId: parsed.wooOrderId,
            note,
        });
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'success',
            source: options.source,
            actions: [created ? 'awb_note_created' : 'awb_note_already_current'],
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return {
            attempted: true,
            success: true,
            channel: 'woocommerce',
            actions: [created ? 'awb_note_created' : 'awb_note_already_current'],
        };
    }
    catch (err) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'failed',
            source: options.source,
            error: err,
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        console.warn(`WooCommerce tracking note sync failed for local order ${order?.order_number || order?.id}:`, err?.response?.data || err?.message || err);
        return {
            attempted: true,
            success: false,
            channel: 'woocommerce',
            error: err?.response?.data || err?.message || err,
        };
    }
};
const syncWooCommerceStatusForLocalOrder = async (order, tx = client_1.db, options = {}) => {
    const localOrderId = String(order?.order_id || '');
    if (!localOrderId.startsWith('woo_')) {
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'not_a_woocommerce_order' };
    }
    const parsed = parseInternalWooOrderId(localOrderId);
    if (!parsed.storeId || !parsed.wooOrderId) {
        return { attempted: false, success: false, channel: 'woocommerce', reason: 'missing_woocommerce_order_id' };
    }
    const orderStatus = String(order?.order_status || '').toLowerCase();
    const awb = String(order?.awb_number || '').trim();
    const [store] = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.id, parsed.storeId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID)))
        .limit(1);
    if (!store) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'skipped',
            source: options.source,
            reason: 'store_not_found',
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'store_not_found' };
    }
    const settings = normalizeWooCommerceSettings((store?.settings || {}));
    const actions = [];
    const previousSyncSource = getPreviousSalesChannelSyncSource(order);
    const canSyncWooStatus = isWooCommerceStatusSyncAllowed(orderStatus, options.source, previousSyncSource);
    const shouldKeepWooCompletedForMovedCancellation = orderStatus === 'cancelled' && hasWooShipmentMovementEvidence(order);
    if (!settings.autoUpdateStatus && !settings.autoUpdateShipmentStatus) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'skipped',
            source: options.source,
            reason: 'disabled_by_settings',
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'disabled_by_settings' };
    }
    if (!canSyncWooStatus || shouldKeepWooCompletedForMovedCancellation) {
        const noteResult = await persistWooCommerceTrackingNote(order, tx, options);
        return {
            attempted: noteResult.attempted,
            success: noteResult.success,
            channel: 'woocommerce',
            reason: shouldKeepWooCompletedForMovedCancellation
                ? 'cancelled_status_blocked_for_shipped_order'
                : 'status_locked_to_booking_or_cancellation',
            actions: noteResult.actions || [],
            error: noteResult.success ? undefined : noteResult.error,
        };
    }
    const wooStatus = orderStatus === 'cancelled'
        ? 'cancelled'
        : ['booked', 'pickup_initiated', 'in_transit', 'out_for_delivery', 'delivered'].includes(orderStatus)
            ? 'completed'
            : '';
    if (!wooStatus) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'skipped',
            source: options.source,
            reason: 'unmapped_status',
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return { attempted: false, success: true, channel: 'woocommerce', reason: 'unmapped_status' };
    }
    try {
        if (settings.autoUpdateStatus) {
            await wooRequest({
                storeUrl: store.domain,
                consumerKey: store.apiKey,
                consumerSecret: store.adminApiAccessToken,
                method: 'put',
                path: `/orders/${encodeURIComponent(parsed.wooOrderId)}`,
                data: { status: wooStatus },
            });
            actions.push(`status_${wooStatus}`);
        }
        if (settings.autoUpdateShipmentStatus && awb) {
            const note = buildWooCommerceSyncNote(orderStatus, awb, order?.courier_partner);
            const created = await ensureWooCommerceSyncNote({
                store,
                wooOrderId: parsed.wooOrderId,
                note,
            });
            actions.push(created ? 'awb_note_created' : 'awb_note_already_current');
        }
        else if (!awb) {
            actions.push('awb_note_skipped_no_awb');
        }
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'success',
            source: options.source,
            actions,
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        return { attempted: true, success: true, channel: 'woocommerce', actions };
    }
    catch (err) {
        await (0, salesChannelSyncAudit_service_1.recordSalesChannelSyncOutcome)(order, {
            channel: 'woocommerce',
            status: 'failed',
            source: options.source,
            actions,
            error: err,
            syncedStatus: orderStatus,
            syncedAwb: awb,
        }, tx);
        console.warn(`WooCommerce status sync failed for local order ${order?.order_number || order?.id}:`, err?.response?.data || err?.message || err);
        return {
            attempted: true,
            success: false,
            channel: 'woocommerce',
            actions,
            error: err?.response?.data || err?.message || err,
        };
    }
};
exports.syncWooCommerceStatusForLocalOrder = syncWooCommerceStatusForLocalOrder;
const syncWooCommerceTrackingNoteForLocalOrder = async (order, tx = client_1.db, options = {}) => persistWooCommerceTrackingNote(order, tx, options);
exports.syncWooCommerceTrackingNoteForLocalOrder = syncWooCommerceTrackingNoteForLocalOrder;
