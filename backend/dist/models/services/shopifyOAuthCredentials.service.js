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
exports.updateShopifyOAuthCredentialsService = exports.getShopifyOAuthCredentialsStatusService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv = __importStar(require("dotenv"));
const classes_1 = require("../../utils/classes");
const shopify_service_1 = require("./shopify.service");
const SHOPIFY_ENV_KEYS = [
    'SHOPIFY_CLIENT_ID',
    'SHOPIFY_CLIENT_SECRET',
    'SHOPIFY_CREDENTIALS_SOURCE',
    'SHOPIFY_CREDENTIALS_UPDATED_AT',
];
const trimText = (value) => String(value ?? '').trim();
const resolveShopifyEnvFilePath = () => {
    const explicitPath = trimText(process.env.SHOPIFY_OAUTH_ENV_FILE);
    if (explicitPath)
        return path_1.default.resolve(explicitPath);
    const env = trimText(process.env.NODE_ENV) || 'development';
    return path_1.default.resolve(process.cwd(), `.env.${env}`);
};
const readEnvFile = async (envFilePath) => {
    try {
        return await promises_1.default.readFile(envFilePath, 'utf8');
    }
    catch (error) {
        if (error?.code === 'ENOENT')
            return '';
        throw error;
    }
};
const maskSecret = (value) => {
    const text = trimText(value);
    if (!text)
        return '';
    if (text.length <= 8)
        return `${text.slice(0, 2)}****${text.slice(-2)}`;
    return `${text.slice(0, 6)}****${text.slice(-4)}`;
};
const formatEnvValue = (value) => {
    if (/^[A-Za-z0-9_.,:/@+=-]*$/.test(value))
        return value;
    return JSON.stringify(value);
};
const isPermissionError = (error) => error?.code === 'EACCES' || error?.code === 'EPERM';
const writeExistingEnvFileDirectly = async (envFilePath, content) => {
    const stat = await promises_1.default.stat(envFilePath).catch((error) => {
        if (error?.code === 'ENOENT')
            return null;
        throw error;
    });
    if (!stat?.isFile())
        return false;
    await promises_1.default.writeFile(envFilePath, content, { encoding: 'utf8' });
    return true;
};
const writeEnvUpdates = async (envFilePath, updates) => {
    const content = await readEnvFile(envFilePath);
    const lines = content ? content.split(/\r?\n/) : [];
    const seen = new Set();
    const nextLines = lines
        .filter((line, index) => index < lines.length - 1 || line.trim())
        .map((line) => {
        if (!line || line.trimStart().startsWith('#') || !line.includes('='))
            return line;
        const key = line.split('=', 1)[0].trim();
        if (!Object.prototype.hasOwnProperty.call(updates, key))
            return line;
        seen.add(key);
        return `${key}=${formatEnvValue(updates[key])}`;
    });
    for (const key of Object.keys(updates)) {
        if (!seen.has(key))
            nextLines.push(`${key}=${formatEnvValue(updates[key])}`);
    }
    await promises_1.default.mkdir(path_1.default.dirname(envFilePath), { recursive: true });
    const tempPath = `${envFilePath}.${process.pid}.${Date.now()}.tmp`;
    const nextContent = `${nextLines.join('\n')}\n`;
    try {
        await promises_1.default.writeFile(tempPath, nextContent, { encoding: 'utf8', mode: 0o600 });
        await promises_1.default.rename(tempPath, envFilePath);
    }
    catch (error) {
        await promises_1.default.unlink(tempPath).catch(() => undefined);
        if (!isPermissionError(error)) {
            throw error;
        }
        const usedDirectWrite = await writeExistingEnvFileDirectly(envFilePath, nextContent);
        if (!usedDirectWrite) {
            throw error;
        }
        console.warn('[ShopifyOAuth] Used direct env file write because temp file write is not permitted', {
            directory: path_1.default.dirname(envFilePath),
            envFile: path_1.default.basename(envFilePath),
            errorCode: error?.code || null,
        });
    }
    await promises_1.default.chmod(envFilePath, 0o600).catch(() => undefined);
};
const getEnvSnapshot = async () => {
    const envFilePath = resolveShopifyEnvFilePath();
    const content = await readEnvFile(envFilePath);
    const parsed = content ? dotenv.parse(content) : {};
    const clientId = trimText(parsed.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_CLIENT_ID);
    const clientSecret = trimText(parsed.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_CLIENT_SECRET);
    const updatedAt = trimText(parsed.SHOPIFY_CREDENTIALS_UPDATED_AT || process.env.SHOPIFY_CREDENTIALS_UPDATED_AT);
    const source = trimText(parsed.SHOPIFY_CREDENTIALS_SOURCE || process.env.SHOPIFY_CREDENTIALS_SOURCE);
    return { envFilePath, parsed, clientId, clientSecret, source, updatedAt };
};
const buildStatusPayload = async () => {
    const snapshot = await getEnvSnapshot();
    const oauthConfig = (0, shopify_service_1.getShopifyOAuthConfig)();
    return {
        configured: Boolean(snapshot.clientId && snapshot.clientSecret && oauthConfig.redirectUri),
        hasClientId: Boolean(snapshot.clientId),
        hasClientSecret: Boolean(snapshot.clientSecret),
        clientId: snapshot.clientId,
        clientIdMasked: maskSecret(snapshot.clientId),
        clientSecretMasked: maskSecret(snapshot.clientSecret),
        credentialsSource: snapshot.source || 'env',
        credentialsUpdatedAt: snapshot.updatedAt || null,
        envFileName: path_1.default.basename(snapshot.envFilePath),
        redirectUri: oauthConfig.redirectUri || null,
        sendOAuthScope: oauthConfig.sendOAuthScope,
        useExpiringOfflineTokens: oauthConfig.useExpiringOfflineTokens,
    };
};
const getShopifyOAuthCredentialsStatusService = async () => buildStatusPayload();
exports.getShopifyOAuthCredentialsStatusService = getShopifyOAuthCredentialsStatusService;
const updateShopifyOAuthCredentialsService = async ({ clientId, clientSecret, adminUserId, }) => {
    const snapshot = await getEnvSnapshot();
    const nextClientId = trimText(clientId) || snapshot.clientId;
    const nextClientSecret = trimText(clientSecret) || snapshot.clientSecret;
    if (!nextClientId) {
        throw new classes_1.HttpError(400, 'SHOPIFY_CLIENT_ID is required');
    }
    if (!nextClientSecret) {
        throw new classes_1.HttpError(400, 'SHOPIFY_CLIENT_SECRET is required');
    }
    if (/\s/.test(nextClientId)) {
        throw new classes_1.HttpError(400, 'SHOPIFY_CLIENT_ID cannot contain spaces');
    }
    if (/\s/.test(nextClientSecret)) {
        throw new classes_1.HttpError(400, 'SHOPIFY_CLIENT_SECRET cannot contain spaces');
    }
    const updates = {
        SHOPIFY_CLIENT_ID: nextClientId,
        SHOPIFY_CLIENT_SECRET: nextClientSecret,
        SHOPIFY_CREDENTIALS_SOURCE: 'admin_panel',
        SHOPIFY_CREDENTIALS_UPDATED_AT: new Date().toISOString(),
    };
    await writeEnvUpdates(snapshot.envFilePath, updates);
    for (const key of SHOPIFY_ENV_KEYS) {
        process.env[key] = updates[key];
    }
    const status = await buildStatusPayload();
    return {
        ...status,
        updatedBy: adminUserId || null,
        secretUpdated: Boolean(trimText(clientSecret)),
    };
};
exports.updateShopifyOAuthCredentialsService = updateShopifyOAuthCredentialsService;
