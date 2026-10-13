"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertVelocityCouriers = exports.extractVelocityCouriers = exports.velocityOperation = exports.velocityReturns = exports.velocityShipments = exports.velocityRates = exports.velocityReports = exports.velocityTracking = exports.velocityCancelOrder = exports.velocityReverseOrder = exports.velocityForwardOrder = exports.velocityServiceability = exports.velocityCreateWarehouse = exports.velocityGetToken = exports.VELOCITY_ENDPOINTS = exports.VELOCITY_PROVIDER = void 0;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../client");
const courierCredentials_1 = require("../../schema/courierCredentials");
const couriers_1 = require("../../schema/couriers");
exports.VELOCITY_PROVIDER = 'velocity';
exports.VELOCITY_ENDPOINTS = {
    authToken: '/custom/api/v1/auth-token',
    warehouse: '/custom/api/v1/warehouse',
    serviceability: '/custom/api/v1/serviceability',
    forwardOrder: '/custom/api/v1/forward-order-orchestration',
    reverseOrder: '/custom/api/v1/reverse-order-orchestration',
    cancelOrder: '/custom/api/v1/cancel-order',
    tracking: '/custom/api/v1/order-tracking',
    reports: '/custom/api/v1/reports',
    rates: '/custom/api/v1/rates',
    shipments: '/custom/api/v1/shipments',
    returns: '/custom/api/v1/returns',
};
const tokenCache = new Map();
const trim = (value) => String(value ?? '').trim();
const readConfig = async () => {
    const [row] = await client_1.db
        .select({
        apiBase: courierCredentials_1.courier_credentials.apiBase,
        username: courierCredentials_1.courier_credentials.username,
        password: courierCredentials_1.courier_credentials.password,
        metadata: courierCredentials_1.courier_credentials.metadata,
    })
        .from(courierCredentials_1.courier_credentials)
        .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, exports.VELOCITY_PROVIDER))
        .limit(1);
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const apiBase = trim(row?.apiBase || process.env.VELOCITY_API_BASE);
    const username = trim(row?.username || process.env.VELOCITY_USERNAME);
    const password = trim(row?.password || process.env.VELOCITY_PASSWORD);
    const authorizationScheme = trim(metadata.authorizationScheme || process.env.VELOCITY_AUTHORIZATION_SCHEME || 'raw').toLowerCase() ===
        'bearer'
        ? 'bearer'
        : 'raw';
    if (!apiBase || !username || !password) {
        throw new Error('Velocity API base URL, username, and password are required');
    }
    let parsed;
    try {
        parsed = new URL(apiBase);
    }
    catch {
        throw new Error('Velocity API base URL must be a valid URL');
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        throw new Error('Velocity API base URL must use HTTPS in production');
    }
    return { apiBase: apiBase.replace(/\/+$/, ''), username, password, authorizationScheme };
};
const providerError = (operation, error) => {
    const axiosError = error;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const bodyText = body && typeof body === 'object'
        ? JSON.stringify(body)
        : typeof body === 'string'
            ? body
            : '';
    const message = body?.message ||
        body?.error ||
        body?.errors?.[0]?.message ||
        bodyText ||
        axiosError.message ||
        'request failed';
    const enriched = new Error(`Velocity ${operation} failed${status ? ` (${status})` : ''}: ${message}`);
    enriched.statusCode = status || 502;
    enriched.response = axiosError.response;
    enriched.providerBody = body ?? null;
    return enriched;
};
const velocityGetToken = async (forceRefresh = false) => {
    const config = await readConfig();
    const cacheKey = `${config.apiBase}|${config.username}`;
    const cached = tokenCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60000)
        return cached;
    try {
        const { data } = await axios_1.default.post(`${config.apiBase}${exports.VELOCITY_ENDPOINTS.authToken}`, { username: config.username, password: config.password }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
        const token = trim(data?.token || data?.payload?.token || data?.data?.token);
        if (!token)
            throw new Error('Velocity did not return an access token');
        const providerExpiry = Date.parse(data?.expires_at || data?.payload?.expires_at || '');
        const expiresAt = Number.isFinite(providerExpiry) ? providerExpiry : Date.now() + 23 * 60 * 60 * 1000;
        const entry = { token, expiresAt };
        tokenCache.set(cacheKey, entry);
        return entry;
    }
    catch (error) {
        throw providerError('authentication', error);
    }
};
exports.velocityGetToken = velocityGetToken;
const request = async (operation, payload) => {
    const config = await readConfig();
    const token = await (0, exports.velocityGetToken)();
    const authorization = config.authorizationScheme === 'raw' ? token.token : `Bearer ${token.token}`;
    try {
        const { data } = await axios_1.default.post(`${config.apiBase}${exports.VELOCITY_ENDPOINTS[operation]}`, payload, {
            headers: { 'Content-Type': 'application/json', Authorization: authorization },
            timeout: 60000,
        });
        return data;
    }
    catch (error) {
        const axiosError = error;
        if (axiosError.response?.status === 401) {
            tokenCache.delete(`${config.apiBase}|${config.username}`);
            const refreshed = await (0, exports.velocityGetToken)(true);
            const refreshedAuthorization = config.authorizationScheme === 'raw' ? refreshed.token : `Bearer ${refreshed.token}`;
            try {
                const { data } = await axios_1.default.post(`${config.apiBase}${exports.VELOCITY_ENDPOINTS[operation]}`, payload, {
                    headers: { 'Content-Type': 'application/json', Authorization: refreshedAuthorization },
                    timeout: 60000,
                });
                return data;
            }
            catch (retryError) {
                throw providerError(operation, retryError);
            }
        }
        throw providerError(operation, error);
    }
};
const velocityCreateWarehouse = (payload) => request('warehouse', payload);
exports.velocityCreateWarehouse = velocityCreateWarehouse;
const velocityServiceability = (payload) => request('serviceability', payload);
exports.velocityServiceability = velocityServiceability;
const velocityForwardOrder = (payload) => request('forwardOrder', payload);
exports.velocityForwardOrder = velocityForwardOrder;
const velocityReverseOrder = (payload) => request('reverseOrder', payload);
exports.velocityReverseOrder = velocityReverseOrder;
const velocityCancelOrder = (payload) => request('cancelOrder', payload);
exports.velocityCancelOrder = velocityCancelOrder;
const velocityTracking = (payload) => request('tracking', payload);
exports.velocityTracking = velocityTracking;
const velocityReports = (payload) => request('reports', payload);
exports.velocityReports = velocityReports;
const velocityRates = (payload) => request('rates', payload);
exports.velocityRates = velocityRates;
const velocityShipments = (payload) => request('shipments', payload);
exports.velocityShipments = velocityShipments;
const velocityReturns = (payload) => request('returns', payload);
exports.velocityReturns = velocityReturns;
const velocityOperation = async (operation, payload) => {
    if (!(operation in exports.VELOCITY_ENDPOINTS) || operation === 'authToken') {
        throw new Error('Unsupported Velocity operation');
    }
    return request(operation, payload);
};
exports.velocityOperation = velocityOperation;
const hashCarrierId = (value) => {
    let hash = 2166136261;
    for (const char of value)
        hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return 800000 + (hash >>> 0) % 99999;
};
const extractVelocityCouriers = (response) => {
    const candidates = response?.result?.serviceable_couriers ||
        response?.result?.serviceability_results ||
        response?.payload?.result?.serviceable_couriers ||
        response?.payload?.serviceable_couriers ||
        [];
    return Array.isArray(candidates)
        ? candidates
            .map((item) => ({
            externalId: trim(item?.carrier_id || item?.carrier_code || item?.id),
            name: trim(item?.carrier_name || item?.courier_name || item?.name),
        }))
            .filter((item) => item.externalId && item.name)
        : [];
};
exports.extractVelocityCouriers = extractVelocityCouriers;
const upsertVelocityCouriers = async (response) => {
    const carriers = (0, exports.extractVelocityCouriers)(response);
    const saved = [];
    for (const carrier of carriers) {
        let id = hashCarrierId(carrier.externalId);
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const [existing] = await client_1.db
                .select({ id: couriers_1.couriers.id, name: couriers_1.couriers.name })
                .from(couriers_1.couriers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, id), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, exports.VELOCITY_PROVIDER)))
                .limit(1);
            if (!existing || existing.name === carrier.name)
                break;
            id = 800000 + ((id - 800000 + 1) % 99999);
        }
        const [row] = await client_1.db
            .insert(couriers_1.couriers)
            .values({
            id,
            name: carrier.name,
            serviceProvider: exports.VELOCITY_PROVIDER,
            isEnabled: true,
            businessType: ['b2c'],
            updatedAt: new Date(),
        })
            .onConflictDoUpdate({
            target: [couriers_1.couriers.id, couriers_1.couriers.serviceProvider],
            set: { name: carrier.name, isEnabled: true, updatedAt: new Date() },
        })
            .returning();
        saved.push({ ...row, externalId: carrier.externalId });
    }
    return saved;
};
exports.upsertVelocityCouriers = upsertVelocityCouriers;
