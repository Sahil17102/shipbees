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
const strict_1 = __importDefault(require("node:assert/strict"));
const crypto = __importStar(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
const dotenv = __importStar(require("dotenv"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: node_path_1.default.resolve(__dirname, `../../.env.${env}`) });
const hasArg = (name) => process.argv.includes(`--${name}`);
const getArgValue = (name) => {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : undefined;
};
const parseCliOptions = () => ({
    mock: hasArg('mock') || String(process.env.SHOPIFY_OAUTH_MOCK || '').toLowerCase() === 'true',
    requirePublic: hasArg('require-public') || String(process.env.SHOPIFY_OAUTH_REQUIRE_PUBLIC || '').toLowerCase() === 'true',
    shop: getArgValue('shop') || process.env.SHOPIFY_OAUTH_CHECK_SHOP,
    returnTo: getArgValue('return-to') || process.env.SHOPIFY_OAUTH_CHECK_RETURN_TO || '/channels/connected',
});
const mask = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed)
        return '';
    if (trimmed.length <= 8)
        return `${trimmed.slice(0, 2)}...`;
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};
const applyMockEnv = () => {
    process.env.API_URL = 'https://api.shipray.com';
    process.env.SHOPIFY_CLIENT_ID = 'mock_shopify_client_id';
    process.env.SHOPIFY_CLIENT_SECRET = 'mock_shopify_client_secret';
    process.env.SHOPIFY_SCOPES =
        'read_orders,write_orders,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders';
    process.env.SHOPIFY_API_VERSION = '2026-07';
    process.env.SHOPIFY_OAUTH_SUCCESS_URL = 'https://app.shipray.com/channels/connected';
    process.env.SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS = 'true';
    process.env.SHOPIFY_SEND_OAUTH_SCOPE = 'false';
};
const callbackHmac = (params, clientSecret) => {
    const message = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join('&');
    return crypto.createHmac('sha256', clientSecret).update(message).digest('hex');
};
const assertPublicRedirectUri = (redirectUri) => {
    const url = new URL(redirectUri);
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' || isLocal) {
        throw new Error(`Shopify OAuth redirect URI must be public HTTPS in production: ${redirectUri}`);
    }
};
const legacyShopifyEnvPresent = () => [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET',
    'SHOPIFY_API_SECRET_KEY',
    'SHOPIFY_WEBHOOK_SECRET',
    'SHOPIFY_ACCESS_TOKEN',
    'SHOPIFY_ADMIN_API_ACCESS_TOKEN',
].filter((key) => String(process.env[key] || '').trim());
const main = async () => {
    var _a;
    const options = parseCliOptions();
    if (options.mock)
        applyMockEnv();
    // The OAuth helpers live in the Shopify service, which imports the shared DB module.
    // This smoke check does not connect to the DB, but the module requires a DATABASE_URL.
    (_a = process.env).DATABASE_URL || (_a.DATABASE_URL = 'postgresql://shopify_oauth_check@127.0.0.1:5432/shopify_oauth_check');
    const { createShopifyInstallBootstrap, buildShopifyOAuthAuthorizeUrl, getShopifyOAuthConfig, normalizeShopifyDomain, verifyShopifyOAuthQueryHmac, verifyShopifySessionToken, verifyShopifyInstallBootstrap, verifyShopifyOAuthState, } = await Promise.resolve().then(() => __importStar(require('../models/services/shopify.service')));
    const { decryptShopifyToken, encryptShopifyToken } = await Promise.resolve().then(() => __importStar(require('../utils/shopifyTokenEncryption')));
    const config = getShopifyOAuthConfig();
    const missing = [
        !config.clientId && 'SHOPIFY_CLIENT_ID',
        !config.clientSecret && 'SHOPIFY_CLIENT_SECRET',
        !config.redirectUri && 'API_URL or SHOPIFY_OAUTH_REDIRECT_URI',
    ].filter(Boolean);
    if (missing.length) {
        const legacyKeys = legacyShopifyEnvPresent();
        const legacyHint = legacyKeys.length
            ? ` Legacy Shopify custom-app env is present (${legacyKeys.join(', ')}), but OAuth intentionally ignores those values. Set Shopify Dev Dashboard credentials as SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.`
            : '';
        throw new Error(`Missing Shopify OAuth configuration: ${missing.join(', ')}.${legacyHint}`);
    }
    const expectedClientId = String(process.env.SHOPIFY_EXPECTED_CLIENT_ID || '').trim();
    if (expectedClientId && config.clientId !== expectedClientId) {
        throw new Error(`SHOPIFY_CLIENT_ID does not match the deployed Shopify app (${mask(config.clientId)} != ${mask(expectedClientId)})`);
    }
    if (!config.useExpiringOfflineTokens) {
        throw new Error('SHOPIFY_USE_EXPIRING_OFFLINE_TOKENS must stay enabled for the public multi-merchant flow');
    }
    if (options.requirePublic)
        assertPublicRedirectUri(config.redirectUri);
    const shop = normalizeShopifyDomain(options.shop || 'shipray-oauth-smoke.myshopify.com');
    const userId = '00000000-0000-0000-0000-000000000000';
    const result = buildShopifyOAuthAuthorizeUrl({
        shop,
        userId,
        returnTo: options.returnTo,
    });
    const authorizeUrl = new URL(result.authUrl);
    strict_1.default.equal(authorizeUrl.hostname, shop);
    strict_1.default.equal(authorizeUrl.pathname, '/admin/oauth/authorize');
    strict_1.default.equal(authorizeUrl.searchParams.get('client_id'), config.clientId);
    if (config.sendOAuthScope) {
        strict_1.default.equal(authorizeUrl.searchParams.get('scope'), config.scopes.join(','));
    }
    else {
        strict_1.default.equal(authorizeUrl.searchParams.has('scope'), false);
    }
    strict_1.default.equal(authorizeUrl.searchParams.get('redirect_uri'), config.redirectUri);
    strict_1.default.equal(authorizeUrl.searchParams.has('grant_options[]'), false);
    const state = authorizeUrl.searchParams.get('state') || '';
    const statePayload = verifyShopifyOAuthState(state);
    strict_1.default.equal(statePayload.shop, shop);
    strict_1.default.equal(statePayload.userId, userId);
    strict_1.default.equal(statePayload.returnTo, options.returnTo);
    const customCredentials = {
        clientId: 'seller_custom_client_id',
        clientSecret: 'seller_custom_client_secret',
    };
    const customResult = buildShopifyOAuthAuthorizeUrl({
        shop,
        userId,
        returnTo: options.returnTo,
        appCredentials: customCredentials,
    });
    const customAuthorizeUrl = new URL(customResult.authUrl);
    strict_1.default.equal(customAuthorizeUrl.searchParams.get('client_id'), customCredentials.clientId);
    const customState = customAuthorizeUrl.searchParams.get('state') || '';
    const customStatePayload = verifyShopifyOAuthState(customState);
    strict_1.default.equal(customStatePayload.appClientId, customCredentials.clientId);
    strict_1.default.notEqual(customStatePayload.encryptedAppClientSecret, customCredentials.clientSecret);
    strict_1.default.equal(decryptShopifyToken(customStatePayload.encryptedAppClientSecret), customCredentials.clientSecret);
    const publicResult = buildShopifyOAuthAuthorizeUrl({
        shop,
        returnTo: '/shopify/install?next=/channels/connected',
        publicInstall: true,
    });
    const publicAuthorizeUrl = new URL(publicResult.authUrl);
    strict_1.default.equal(publicAuthorizeUrl.searchParams.has('scope'), config.sendOAuthScope);
    strict_1.default.equal(publicResult.installMode, 'public');
    const publicState = publicAuthorizeUrl.searchParams.get('state') || '';
    const publicStatePayload = verifyShopifyOAuthState(publicState, { allowMissingUserId: true });
    strict_1.default.equal(publicStatePayload.shop, shop);
    strict_1.default.equal(publicStatePayload.userId, undefined);
    strict_1.default.equal(publicStatePayload.returnTo, '/shopify/install?next=/channels/connected');
    const bootstrap = createShopifyInstallBootstrap({
        shop,
        userId,
        returnTo: '/channels/connected',
    });
    const bootstrapPayload = verifyShopifyInstallBootstrap(bootstrap);
    strict_1.default.equal(bootstrapPayload.shop, shop);
    strict_1.default.equal(bootstrapPayload.userId, userId);
    strict_1.default.equal(bootstrapPayload.returnTo, '/channels/connected');
    const callbackQuery = {
        code: 'mock_authorization_code',
        shop,
        state,
        timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const hmac = callbackHmac(callbackQuery, config.clientSecret);
    strict_1.default.equal(verifyShopifyOAuthQueryHmac({ ...callbackQuery, hmac }), true);
    const customCallbackQuery = {
        ...callbackQuery,
        state: customState,
    };
    const customHmac = callbackHmac(customCallbackQuery, customCredentials.clientSecret);
    strict_1.default.equal(verifyShopifyOAuthQueryHmac({ ...customCallbackQuery, hmac: customHmac }, customCredentials.clientSecret), true);
    const sessionToken = jsonwebtoken_1.default.sign({
        aud: config.clientId,
        dest: `https://${shop}`,
        iss: `https://${shop}/admin`,
        sub: '123456789',
        nbf: Math.floor(Date.now() / 1000) - 1,
    }, config.clientSecret, { algorithm: 'HS256', expiresIn: 60 });
    const sessionPayload = verifyShopifySessionToken(sessionToken);
    strict_1.default.equal(new URL(sessionPayload.dest).hostname, shop);
    strict_1.default.equal(sessionPayload.aud, config.clientId);
    const encryptedToken = encryptShopifyToken('shpat_smoke_check');
    strict_1.default.notEqual(encryptedToken, 'shpat_smoke_check');
    strict_1.default.equal(decryptShopifyToken(encryptedToken), 'shpat_smoke_check');
    strict_1.default.equal(encryptShopifyToken(encryptedToken), encryptedToken);
    console.log('Shopify OAuth smoke check passed');
    console.log(JSON.stringify({
        mode: options.mock ? 'mock' : 'configured',
        shop,
        clientId: mask(config.clientId),
        redirectUri: config.redirectUri,
        scopes: config.scopes,
        scopeSource: result.scopeSource,
        accessMode: result.accessMode,
        publicInstallMode: publicResult.installMode,
        expiringOfflineTokens: config.useExpiringOfflineTokens,
        grantOptions: 'omitted_for_offline_access',
        callbackHmacVerified: true,
        sessionTokenVerified: true,
        tokenEncryptionVerified: true,
    }, null, 2));
    process.exit(0);
};
main().catch((error) => {
    console.error('Shopify OAuth smoke check failed');
    console.error(error?.message || String(error));
    process.exit(1);
});
