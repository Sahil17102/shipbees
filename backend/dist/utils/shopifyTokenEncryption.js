"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptShopifyStoreMetadata = exports.encryptShopifyOAuth = exports.decryptShopifyToken = exports.encryptShopifyToken = exports.isEncryptedShopifyToken = void 0;
const secretEncryption_1 = require("./secretEncryption");
const ENCRYPTED_PREFIX = 'enc:v1:';
const isEncryptedShopifyToken = (value) => String(value || '').startsWith(ENCRYPTED_PREFIX);
exports.isEncryptedShopifyToken = isEncryptedShopifyToken;
const encryptShopifyToken = (value) => {
    const token = String(value || '').trim();
    if (!token || (0, exports.isEncryptedShopifyToken)(token))
        return token;
    return `${ENCRYPTED_PREFIX}${(0, secretEncryption_1.encryptSecret)(token)}`;
};
exports.encryptShopifyToken = encryptShopifyToken;
const decryptShopifyToken = (value) => {
    const token = String(value || '').trim();
    if (!token || !(0, exports.isEncryptedShopifyToken)(token))
        return token;
    return (0, secretEncryption_1.decryptSecret)(token.slice(ENCRYPTED_PREFIX.length));
};
exports.decryptShopifyToken = decryptShopifyToken;
const encryptShopifyOAuth = (oauth = {}) => ({
    ...oauth,
    refreshToken: oauth.refreshToken ? (0, exports.encryptShopifyToken)(oauth.refreshToken) : oauth.refreshToken,
    appClientSecret: oauth.appClientSecret
        ? (0, exports.encryptShopifyToken)(oauth.appClientSecret)
        : oauth.appClientSecret,
});
exports.encryptShopifyOAuth = encryptShopifyOAuth;
const encryptShopifyStoreMetadata = (metadata = {}) => ({
    ...metadata,
    shopifyWebhookSecret: metadata.shopifyWebhookSecret
        ? (0, exports.encryptShopifyToken)(metadata.shopifyWebhookSecret)
        : metadata.shopifyWebhookSecret,
    webhookSecret: metadata.webhookSecret
        ? (0, exports.encryptShopifyToken)(metadata.webhookSecret)
        : metadata.webhookSecret,
    apiSecret: metadata.apiSecret ? (0, exports.encryptShopifyToken)(metadata.apiSecret) : metadata.apiSecret,
    apiSecretKey: metadata.apiSecretKey && metadata.apiSecretKey !== 'configured'
        ? (0, exports.encryptShopifyToken)(metadata.apiSecretKey)
        : metadata.apiSecretKey,
    oauth: metadata.oauth && typeof metadata.oauth === 'object'
        ? (0, exports.encryptShopifyOAuth)(metadata.oauth)
        : metadata.oauth,
});
exports.encryptShopifyStoreMetadata = encryptShopifyStoreMetadata;
