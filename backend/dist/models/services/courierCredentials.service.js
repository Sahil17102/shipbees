"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCourierCredentialsMeta = exports.upsertCourierCredentials = exports.getEffectiveCourierConfig = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const courierCredentials_1 = require("../schema/courierCredentials");
const KNOWN_PROVIDERS = [
    'delhivery',
    'shipway',
    'xpressbees',
    'ekart',
    'shadowfax',
    'indiapost',
    'velocity',
];
const hasEnvForProviderAndType = (provider, _type) => {
    if (provider === 'delhivery') {
        return !!(process.env.DELHIVERY_API_KEY || process.env.DELHIVERY_CLIENT_NAME);
    }
    if (provider === 'shipway') {
        return !!(process.env.SHIPWAY_USERNAME || process.env.SHIPWAY_PASSWORD);
    }
    if (provider === 'xpressbees') {
        return !!(process.env.XPRESSBEES_API_TOKEN ||
            process.env.XPRESSBEES_XB_KEY ||
            (process.env.XPRESSBEES_USERNAME && process.env.XPRESSBEES_PASSWORD));
    }
    if (provider === 'ekart') {
        return !!(process.env.EKART_CLIENT_ID ||
            process.env.EKART_USERNAME ||
            process.env.EKART_PASSWORD ||
            process.env.EKART_BASE_API ||
            process.env.EKART_BASE_AUTH);
    }
    if (provider === 'shadowfax') {
        return !!(process.env.SHADOWFAX_API_TOKEN ||
            process.env.SHADOWFAX_API_KEY ||
            process.env.SHADOWFAX_API_BASE);
    }
    if (provider === 'indiapost') {
        return !!(process.env.INDIAPOST_USERNAME && process.env.INDIAPOST_PASSWORD);
    }
    if (provider === 'velocity') {
        return !!((process.env.VELOCITY_USERNAME && process.env.VELOCITY_PASSWORD) ||
            process.env.VELOCITY_API_BASE);
    }
    return false;
};
const normalize = (val) => String(val || '').trim();
const buildConfigFromRow = (provider, row) => {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (provider === 'ekart') {
        const cfg = {
            clientId: normalize(row.clientId),
            username: normalize(row.username),
            password: normalize(row.password),
            baseApi: normalize(row.apiBase),
        };
        return cfg;
    }
    if (provider === 'delhivery') {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        const cfg = {
            apiKey: normalize(row.apiKey),
            clientName: normalize(row.clientName),
            ltlApiBase: normalize(metadata.ltlApiBase || metadata.ltl_api_base || ''),
            ltlToken: normalize(metadata.ltlToken || metadata.ltl_token || ''),
            ltlTokenExpiresAt: normalize(metadata.ltlTokenExpiresAt || metadata.ltl_token_expires_at || ''),
            ltlUsername: normalize(metadata.ltlUsername || metadata.ltl_username || ''),
            ltlEmail: normalize(metadata.ltlEmail || metadata.ltl_email || ''),
            ltlPassword: normalize(metadata.ltlPassword || metadata.ltl_password || ''),
        };
        return cfg;
    }
    if (provider === 'shipway') {
        const cfg = {
            username: normalize(row.username),
            password: normalize(row.password),
        };
        return cfg;
    }
    if (provider === 'shadowfax') {
        const cfg = {
            apiBase: normalize(row.apiBase),
            apiToken: normalize(row.apiKey),
            clientName: normalize(row.clientName),
            webhookSecret: normalize(row.webhookSecret),
        };
        return cfg;
    }
    if (provider === 'velocity') {
        const cfg = {
            apiBase: normalize(row.apiBase),
            username: normalize(row.username),
            password: normalize(row.password),
            authorizationScheme: String(metadata.authorizationScheme || 'bearer').toLowerCase() === 'raw'
                ? 'raw'
                : 'bearer',
        };
        return cfg;
    }
    const cfg = {
        apiBase: normalize(row.apiBase),
        apiToken: normalize(row.apiKey),
        authBearer: normalize(metadata.authBearer ||
            metadata.auth_bearer ||
            metadata.authorizationBearer ||
            ''),
        email: normalize(row.username),
        password: normalize(row.password),
        secretKey: normalize(metadata.secretKey ||
            metadata.secret_key ||
            metadata.xpressbeesSecretKey ||
            ''),
        xbKey: normalize(metadata.xbKey ||
            metadata.xb_key ||
            metadata.xpressbeesXbKey ||
            ''),
        xbAccessKey: normalize(metadata.xbAccessKey ||
            metadata.xb_access_key ||
            metadata.xpressbeesXbAccessKey ||
            ''),
        businessUnit: normalize(metadata.businessUnit || ''),
        businessFlow: normalize(metadata.businessFlow || ''),
        businessService: normalize(metadata.businessService || ''),
        businessServices: normalize(metadata.businessServices || ''),
        businessAccountName: normalize(metadata.businessAccountName ||
            metadata.business_account_name ||
            metadata.xpressbeesBusinessAccountName ||
            ''),
        pickupVendorCode: normalize(metadata.pickupVendorCode ||
            metadata.pickup_vendor_code ||
            metadata.xpressbeesPickupVendorCode ||
            ''),
        manifestServiceType: normalize(metadata.manifestServiceType || ''),
        manifestPickupType: normalize(metadata.manifestPickupType || ''),
        pincodeBusinessUnit: normalize(metadata.pincodeBusinessUnit || ''),
        pincodeBusinessFlow: normalize(metadata.pincodeBusinessFlow || ''),
        pickupBusinessService: normalize(metadata.pickupBusinessService || ''),
        deliveryBusinessService: normalize(metadata.deliveryBusinessService || ''),
        serviceabilityVersion: normalize(metadata.serviceabilityVersion || ''),
        trackingVersion: normalize(metadata.trackingVersion || ''),
    };
    return cfg;
};
const getEffectiveCourierConfig = async (provider, _type) => {
    let row;
    try {
        ;
        [row] = await client_1.db.select().from(courierCredentials_1.courierCredentials).where((0, drizzle_orm_1.eq)(courierCredentials_1.courierCredentials.provider, provider));
    }
    catch (err) {
        if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
            console.warn('[getEffectiveCourierConfig] courier_credentials table does not exist, using env fallback', provider);
            return null;
        }
        throw err;
    }
    if (!row)
        return null;
    return buildConfigFromRow(provider, row);
};
exports.getEffectiveCourierConfig = getEffectiveCourierConfig;
const upsertCourierCredentials = async (payload) => {
    const { serviceProvider, b2c, b2b } = payload;
    const mergedConfig = (b2c?.config ?? b2b?.config ?? null);
    const values = {
        provider: serviceProvider,
        apiBase: normalize(mergedConfig?.baseApi || mergedConfig?.apiBase || ''),
        clientName: normalize(mergedConfig?.clientName || ''),
        apiKey: normalize(mergedConfig?.apiKey || mergedConfig?.apiToken || ''),
        clientId: normalize(mergedConfig?.clientId || ''),
        username: normalize(mergedConfig?.username || mergedConfig?.email || ''),
        password: normalize(mergedConfig?.password || ''),
        webhookSecret: normalize(mergedConfig?.webhookSecret || ''),
        updatedAt: new Date(),
    };
    await client_1.db
        .insert(courierCredentials_1.courierCredentials)
        .values(values)
        .onConflictDoUpdate({
        target: courierCredentials_1.courierCredentials.provider,
        set: {
            ...values,
            updatedAt: new Date(),
        },
    });
};
exports.upsertCourierCredentials = upsertCourierCredentials;
const listCourierCredentialsMeta = async () => {
    let rows = [];
    try {
        rows = await client_1.db.select().from(courierCredentials_1.courierCredentials);
    }
    catch (err) {
        if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
            return KNOWN_PROVIDERS.map((provider) => ({
                serviceProvider: provider,
                b2c: { configured: false, sameAsB2b: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2c') },
                b2b: { configured: false, sameAsB2c: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2b') },
            }));
        }
        throw err;
    }
    const byProvider = new Map();
    for (const row of rows)
        byProvider.set(row.provider, row);
    return KNOWN_PROVIDERS.map((provider) => {
        const row = byProvider.get(provider);
        const configured = !!row && [row.apiBase, row.clientName, row.apiKey, row.clientId, row.username, row.password].some((v) => normalize(v).length > 0);
        return {
            serviceProvider: provider,
            b2c: {
                configured,
                sameAsB2b: false,
                usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2c'),
            },
            b2b: {
                configured,
                sameAsB2c: false,
                usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2b'),
            },
        };
    });
};
exports.listCourierCredentialsMeta = listCourierCredentialsMeta;
