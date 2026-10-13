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
exports.applyAmazonShippingCredentialsToEnv = exports.getStoredAmazonShippingCredentials = exports.mergeAmazonShippingCredentialsWithEnv = exports.mergeAmazonShippingCredentials = exports.buildAmazonShippingCredentialsFromEnv = exports.buildAmazonShippingCredentialsFromRow = exports.normalizeAmazonCredentialTokens = exports.maskAmazonCredential = exports.parseAmazonSandboxFlag = exports.normalizeAmazonCredentialValue = exports.AMAZON_DEFAULT_REGION = exports.AMAZON_DEFAULT_BUSINESS_ID = exports.AMAZON_CREDENTIALS_PROVIDER = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const courierCredentials_1 = require("../schema/courierCredentials");
exports.AMAZON_CREDENTIALS_PROVIDER = 'amazon';
exports.AMAZON_DEFAULT_BUSINESS_ID = 'AmazonShipping_IN';
exports.AMAZON_DEFAULT_REGION = 'eu';
const normalizeAmazonCredentialValue = (value) => String(value ?? '').trim();
exports.normalizeAmazonCredentialValue = normalizeAmazonCredentialValue;
const parseAmazonSandboxFlag = (value) => {
    if (typeof value === 'boolean')
        return value;
    return ['1', 'true', 'yes', 'y', 'sandbox'].includes((0, exports.normalizeAmazonCredentialValue)(value).toLowerCase());
};
exports.parseAmazonSandboxFlag = parseAmazonSandboxFlag;
const maskAmazonCredential = (value) => {
    const normalized = (0, exports.normalizeAmazonCredentialValue)(value);
    if (!normalized)
        return '';
    if (normalized.length <= 8)
        return '********';
    return `${normalized.slice(0, 4)}${'*'.repeat(Math.max(normalized.length - 8, 0))}${normalized.slice(-4)}`;
};
exports.maskAmazonCredential = maskAmazonCredential;
const looksLikeAmazonAccessToken = (value) => /^Atza\|/i.test(value);
const looksLikeAmazonRefreshToken = (value) => /^Atzr\|/i.test(value);
const normalizeAmazonCredentialTokens = ({ accessToken, refreshToken, }) => {
    let access = (0, exports.normalizeAmazonCredentialValue)(accessToken);
    let refresh = (0, exports.normalizeAmazonCredentialValue)(refreshToken);
    // Amazon LWA access tokens start with Atza|, while refresh tokens start with Atzr|.
    // If an access token is pasted into the refresh-token field, Amazon returns invalid_grant.
    if (looksLikeAmazonRefreshToken(access) && looksLikeAmazonAccessToken(refresh)) {
        return { accessToken: refresh, refreshToken: access };
    }
    if (!access && looksLikeAmazonAccessToken(refresh)) {
        access = refresh;
        refresh = '';
    }
    if (!refresh && looksLikeAmazonRefreshToken(access)) {
        refresh = access;
        access = '';
    }
    return { accessToken: access, refreshToken: refresh };
};
exports.normalizeAmazonCredentialTokens = normalizeAmazonCredentialTokens;
const getMetadata = (row) => {
    const metadata = row?.metadata;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata
        : {};
};
const buildAmazonShippingCredentialsFromRow = (row) => {
    if (!row)
        return {};
    const metadata = getMetadata(row);
    const sandbox = metadata.sandbox !== undefined
        ? (0, exports.parseAmazonSandboxFlag)(metadata.sandbox)
        : row?.webhookSecret
            ? (0, exports.parseAmazonSandboxFlag)(row.webhookSecret)
            : undefined;
    const tokens = (0, exports.normalizeAmazonCredentialTokens)({
        accessToken: metadata.accessToken,
        refreshToken: metadata.refreshToken || row?.apiKey,
    });
    return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        lwaClientId: (0, exports.normalizeAmazonCredentialValue)(metadata.lwaClientId || row?.clientId),
        lwaClientSecret: (0, exports.normalizeAmazonCredentialValue)(metadata.lwaClientSecret || row?.password),
        endpoint: (0, exports.normalizeAmazonCredentialValue)(metadata.endpoint || row?.apiBase),
        region: (0, exports.normalizeAmazonCredentialValue)(metadata.region || row?.username || exports.AMAZON_DEFAULT_REGION),
        sandbox,
        shippingBusinessId: (0, exports.normalizeAmazonCredentialValue)(metadata.shippingBusinessId || row?.clientName || exports.AMAZON_DEFAULT_BUSINESS_ID),
        lwaTokenUrl: (0, exports.normalizeAmazonCredentialValue)(metadata.lwaTokenUrl),
    };
};
exports.buildAmazonShippingCredentialsFromRow = buildAmazonShippingCredentialsFromRow;
const buildAmazonShippingCredentialsFromEnv = (env = process.env) => {
    const tokens = (0, exports.normalizeAmazonCredentialTokens)({
        accessToken: env.AMAZON_SHIPPING_ACCESS_TOKEN,
        refreshToken: env.AMAZON_SHIPPING_REFRESH_TOKEN,
    });
    return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        lwaClientId: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_LWA_CLIENT_ID || env.AMAZON_LWA_CLIENT_ID),
        lwaClientSecret: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_LWA_CLIENT_SECRET || env.AMAZON_LWA_CLIENT_SECRET),
        endpoint: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_API_BASE),
        region: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_REGION),
        sandbox: env.AMAZON_SHIPPING_SANDBOX === undefined
            ? undefined
            : (0, exports.parseAmazonSandboxFlag)(env.AMAZON_SHIPPING_SANDBOX),
        shippingBusinessId: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_BUSINESS_ID),
        lwaTokenUrl: (0, exports.normalizeAmazonCredentialValue)(env.AMAZON_SHIPPING_LWA_TOKEN_URL || env.AMAZON_LWA_TOKEN_URL),
    };
};
exports.buildAmazonShippingCredentialsFromEnv = buildAmazonShippingCredentialsFromEnv;
const mergeAmazonShippingCredentials = (base, override) => {
    const merged = { ...base };
    const stringKeys = [
        'accessToken',
        'refreshToken',
        'lwaClientId',
        'lwaClientSecret',
        'endpoint',
        'region',
        'shippingBusinessId',
        'idempotencyKey',
        'lwaTokenUrl',
    ];
    stringKeys.forEach((key) => {
        const value = (0, exports.normalizeAmazonCredentialValue)(override[key]);
        if (value) {
            ;
            merged[key] = value;
        }
    });
    if (override.sandbox !== undefined)
        merged.sandbox = override.sandbox;
    if (override.useDirectAccessToken !== undefined) {
        merged.useDirectAccessToken = override.useDirectAccessToken;
    }
    const tokens = (0, exports.normalizeAmazonCredentialTokens)({
        accessToken: merged.accessToken,
        refreshToken: merged.refreshToken,
    });
    merged.accessToken = tokens.accessToken;
    merged.refreshToken = tokens.refreshToken;
    return merged;
};
exports.mergeAmazonShippingCredentials = mergeAmazonShippingCredentials;
const mergeAmazonShippingCredentialsWithEnv = (credentials, env = process.env) => (0, exports.mergeAmazonShippingCredentials)(credentials, (0, exports.buildAmazonShippingCredentialsFromEnv)(env));
exports.mergeAmazonShippingCredentialsWithEnv = mergeAmazonShippingCredentialsWithEnv;
const getStoredAmazonShippingCredentials = async () => {
    const { db } = await Promise.resolve().then(() => __importStar(require('../client')));
    const [row] = await db
        .select()
        .from(courierCredentials_1.courier_credentials)
        .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, exports.AMAZON_CREDENTIALS_PROVIDER))
        .limit(1);
    return (0, exports.mergeAmazonShippingCredentialsWithEnv)((0, exports.buildAmazonShippingCredentialsFromRow)(row));
};
exports.getStoredAmazonShippingCredentials = getStoredAmazonShippingCredentials;
const applyAmazonShippingCredentialsToEnv = (credentials, options = {}) => {
    const mappings = [
        ['accessToken', 'AMAZON_SHIPPING_ACCESS_TOKEN'],
        ['refreshToken', 'AMAZON_SHIPPING_REFRESH_TOKEN'],
        ['lwaClientId', 'AMAZON_SHIPPING_LWA_CLIENT_ID'],
        ['lwaClientSecret', 'AMAZON_SHIPPING_LWA_CLIENT_SECRET'],
        ['endpoint', 'AMAZON_SHIPPING_API_BASE'],
        ['region', 'AMAZON_SHIPPING_REGION'],
        ['shippingBusinessId', 'AMAZON_SHIPPING_BUSINESS_ID'],
        ['lwaTokenUrl', 'AMAZON_SHIPPING_LWA_TOKEN_URL'],
    ];
    mappings.forEach(([key, envKey]) => {
        const value = (0, exports.normalizeAmazonCredentialValue)(credentials[key]);
        if (value && (options.overwriteExisting || !(0, exports.normalizeAmazonCredentialValue)(process.env[envKey]))) {
            process.env[envKey] = value;
        }
    });
    if (credentials.sandbox !== undefined &&
        (options.overwriteExisting ||
            !(0, exports.normalizeAmazonCredentialValue)(process.env.AMAZON_SHIPPING_SANDBOX))) {
        process.env.AMAZON_SHIPPING_SANDBOX = String(Boolean(credentials.sandbox));
    }
};
exports.applyAmazonShippingCredentialsToEnv = applyAmazonShippingCredentialsToEnv;
