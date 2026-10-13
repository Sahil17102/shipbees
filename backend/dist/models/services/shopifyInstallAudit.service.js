"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logShopifyInstallEvent = void 0;
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const MAX_LOG_BYTES = 10 * 1024 * 1024;
let writeQueue = Promise.resolve();
const sanitizeText = (value) => String(value || '')
    .replace(/shp[a-z]{2}_[a-zA-Z0-9_-]+/g, '[redacted-shopify-token]')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/[a-f0-9]{32,}/gi, '[redacted-secret]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 300);
const getLogPath = () => String(process.env.SHOPIFY_INSTALL_AUDIT_LOG_PATH || '').trim() ||
    path_1.default.resolve(process.cwd(), 'logs', 'shopify-install-audit.jsonl');
const rotateIfNeeded = async (logPath) => {
    try {
        const current = await (0, promises_1.stat)(logPath);
        if (current.size < MAX_LOG_BYTES)
            return;
        const rotatedPath = `${logPath}.1`;
        await (0, promises_1.rm)(rotatedPath, { force: true });
        await (0, promises_1.rename)(logPath, rotatedPath);
    }
    catch (error) {
        if (error?.code !== 'ENOENT')
            throw error;
    }
};
const logShopifyInstallEvent = (entry) => {
    writeQueue = writeQueue
        .then(async () => {
        const logPath = getLogPath();
        await (0, promises_1.mkdir)(path_1.default.dirname(logPath), { recursive: true });
        await rotateIfNeeded(logPath);
        const payload = {
            timestamp: new Date().toISOString(),
            event: sanitizeText(entry.event),
            status: entry.status,
            requestId: sanitizeText(entry.requestId) || undefined,
            shop: sanitizeText(entry.shop) || undefined,
            source: entry.source || 'backend',
            durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Number(entry.durationMs)) : undefined,
            httpStatus: Number.isFinite(entry.httpStatus) ? Number(entry.httpStatus) : undefined,
            detail: sanitizeText(entry.detail) || undefined,
            existingConnection: typeof entry.existingConnection === 'boolean' ? entry.existingConnection : undefined,
        };
        await (0, promises_1.appendFile)(logPath, `${JSON.stringify(payload)}\n`, { encoding: 'utf8', mode: 0o600 });
    })
        .catch((error) => {
        console.warn('Shopify install audit write failed:', error?.message || error);
    });
    return writeQueue;
};
exports.logShopifyInstallEvent = logShopifyInstallEvent;
