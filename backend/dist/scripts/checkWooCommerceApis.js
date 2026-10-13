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
const node_http_1 = __importDefault(require("node:http"));
const node_path_1 = __importDefault(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: node_path_1.default.resolve(__dirname, `../../.env.${env}`) });
const getArgValue = (name) => {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : undefined;
};
const hasArg = (name) => process.argv.includes(`--${name}`);
const parseCliOptions = () => ({
    mock: hasArg('mock') || String(process.env.WOOCOMMERCE_MOCK || '').toLowerCase() === 'true',
    checkWrite: hasArg('check-write') ||
        String(process.env.WOOCOMMERCE_CHECK_WRITE || '').toLowerCase() === 'true',
    storeUrl: getArgValue('store-url') || process.env.WOOCOMMERCE_STORE_URL,
    consumerKey: getArgValue('consumer-key') || process.env.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: getArgValue('consumer-secret') || process.env.WOOCOMMERCE_CONSUMER_SECRET,
});
const normalizeWooCommerceUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw)
        return '';
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return withProtocol.replace(/\/+$/, '');
};
const getWooApiBase = (storeUrl) => `${normalizeWooCommerceUrl(storeUrl)}/wp-json/wc/v3`;
const maskKey = (value) => {
    const trimmed = String(value || '').trim();
    if (trimmed.length <= 10)
        return trimmed ? `${trimmed.slice(0, 4)}...` : '';
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};
const readJsonBody = async (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('error', reject);
    req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw)
            return resolve(null);
        try {
            resolve(JSON.parse(raw));
        }
        catch (error) {
            reject(error);
        }
    });
});
const sendJson = (res, statusCode, body) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};
const requireMockAuth = (req, parsedUrl) => {
    const expected = `Basic ${Buffer.from('ck_mock_woocommerce:cs_mock_woocommerce').toString('base64')}`;
    const queryKey = parsedUrl.searchParams.get('consumer_key');
    const querySecret = parsedUrl.searchParams.get('consumer_secret');
    if (req.headers.authorization === expected ||
        (queryKey === 'ck_mock_woocommerce' && querySecret === 'cs_mock_woocommerce')) {
        return;
    }
    throw new Error('Mock WooCommerce request did not include the expected credentials');
};
const startMockWooCommerceServer = async () => {
    const captured = [];
    let createdWebhookId = null;
    const server = node_http_1.default.createServer(async (req, res) => {
        try {
            const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
            const pathname = requestUrl.pathname;
            captured.push({ method: req.method || '', path: pathname });
            requireMockAuth(req, requestUrl);
            if (req.method === 'GET' && pathname === '/wp-json/wc/v3/system_status') {
                return sendJson(res, 200, {
                    environment: {
                        site_title: 'Shipray Woo Test Store',
                        site_url: `http://127.0.0.1/mock-store`,
                        version: '9.9.0',
                    },
                    settings: {
                        currency: 'INR',
                    },
                });
            }
            if (req.method === 'GET' && pathname === '/wp-json/wc/v3/orders') {
                return sendJson(res, 200, [
                    {
                        id: 101,
                        number: 'WC-101',
                        status: 'processing',
                        total: '1299.00',
                        currency: 'INR',
                        date_created: '2026-05-22T10:00:00',
                    },
                    {
                        id: 100,
                        number: 'WC-100',
                        status: 'completed',
                        total: '799.00',
                        currency: 'INR',
                        date_created: '2026-05-21T18:30:00',
                    },
                ]);
            }
            if (req.method === 'GET' && pathname === '/wp-json/wc/v3/webhooks') {
                return sendJson(res, 200, [
                    {
                        id: 7,
                        name: 'Existing order webhook',
                        topic: 'order.created',
                        delivery_url: 'https://api.shipray.com/api/webhook/woocommerce/orders',
                        status: 'active',
                    },
                ]);
            }
            if (req.method === 'POST' && pathname === '/wp-json/wc/v3/webhooks') {
                const body = await readJsonBody(req);
                strict_1.default.equal(body?.topic, 'order.updated');
                strict_1.default.equal(body?.status, 'paused');
                strict_1.default.ok(String(body?.delivery_url || '').startsWith('http'));
                createdWebhookId = 22;
                return sendJson(res, 201, {
                    id: createdWebhookId,
                    name: body?.name,
                    topic: body?.topic,
                    delivery_url: body?.delivery_url,
                    status: body?.status,
                });
            }
            if (req.method === 'DELETE' &&
                createdWebhookId &&
                pathname === `/wp-json/wc/v3/webhooks/${createdWebhookId}`) {
                return sendJson(res, 200, {
                    id: createdWebhookId,
                    deleted: true,
                });
            }
            return sendJson(res, 404, { message: `Unhandled mock endpoint ${req.method} ${pathname}` });
        }
        catch (error) {
            return sendJson(res, 500, { message: error?.message || String(error) });
        }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        captured,
        close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
    };
};
const wooRequest = async ({ storeUrl, consumerKey, consumerSecret, method, path: requestPath, data, params, }) => {
    const baseURL = getWooApiBase(storeUrl);
    const baseConfig = {
        baseURL,
        method,
        url: requestPath,
        data,
        params,
        auth: {
            username: consumerKey.trim(),
            password: consumerSecret.trim(),
        },
        timeout: Number(process.env.PLATFORM_API_TIMEOUT_MS || 15000),
    };
    try {
        const response = await axios_1.default.request(baseConfig);
        return response.data;
    }
    catch (err) {
        const status = Number(err?.response?.status || 0);
        const canUseQueryStringAuth = normalizeWooCommerceUrl(storeUrl).toLowerCase().startsWith('https://') &&
            (status === 401 || status === 403);
        if (!canUseQueryStringAuth)
            throw err;
        const response = await axios_1.default.request({
            ...baseConfig,
            auth: undefined,
            params: {
                ...(params || {}),
                consumer_key: consumerKey.trim(),
                consumer_secret: consumerSecret.trim(),
            },
        });
        return response.data;
    }
};
const createAndDeletePermissionWebhook = async ({ storeUrl, consumerKey, consumerSecret, }) => {
    const configuredWebhookUrl = String(process.env.WOOCOMMERCE_CHECK_WEBHOOK_URL || '').trim();
    const configuredApiUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '');
    const deliveryUrl = configuredWebhookUrl ||
        (configuredApiUrl
            ? `${configuredApiUrl}/api/webhook/woocommerce/orders`
            : 'https://example.com/shipray-woocommerce-check');
    const created = await wooRequest({
        storeUrl,
        consumerKey,
        consumerSecret,
        method: 'post',
        path: '/webhooks',
        data: {
            name: `Shipray permission check ${Date.now()}`,
            topic: 'order.updated',
            delivery_url: deliveryUrl,
            secret: crypto.randomBytes(16).toString('hex'),
            status: 'paused',
        },
    });
    try {
        await wooRequest({
            storeUrl,
            consumerKey,
            consumerSecret,
            method: 'delete',
            path: `/webhooks/${encodeURIComponent(created?.id)}`,
            params: { force: true },
        });
    }
    catch (error) {
        console.warn(`Warning: created test webhook ${created?.id || ''} but could not delete it automatically.`);
        throw error;
    }
    return created?.id;
};
const requiredMessage = () => [
    'Missing WooCommerce credentials.',
    '',
    'Use a real store:',
    '  WOOCOMMERCE_STORE_URL=https://yourstore.com',
    '  WOOCOMMERCE_CONSUMER_KEY=ck_...',
    '  WOOCOMMERCE_CONSUMER_SECRET=cs_...',
    '  npm run check:woocommerce-apis',
    '',
    'Or run the built-in mock proof:',
    '  npm run check:woocommerce-apis -- --mock',
].join('\n');
const main = async () => {
    const options = parseCliOptions();
    let mockServer = null;
    try {
        if (options.mock) {
            mockServer = await startMockWooCommerceServer();
            options.storeUrl = mockServer.baseUrl;
            options.consumerKey = 'ck_mock_woocommerce';
            options.consumerSecret = 'cs_mock_woocommerce';
            options.checkWrite = true;
        }
        const storeUrl = normalizeWooCommerceUrl(options.storeUrl || '');
        const consumerKey = String(options.consumerKey || '').trim();
        const consumerSecret = String(options.consumerSecret || '').trim();
        if (!storeUrl || !consumerKey || !consumerSecret) {
            throw new Error(requiredMessage());
        }
        const systemStatus = await wooRequest({
            storeUrl,
            consumerKey,
            consumerSecret,
            method: 'get',
            path: '/system_status',
        });
        const orders = await wooRequest({
            storeUrl,
            consumerKey,
            consumerSecret,
            method: 'get',
            path: '/orders',
            params: {
                per_page: 5,
                status: 'any',
                orderby: 'date',
                order: 'desc',
            },
        });
        const webhooks = await wooRequest({
            storeUrl,
            consumerKey,
            consumerSecret,
            method: 'get',
            path: '/webhooks',
            params: { per_page: 100 },
        });
        let writeCheck = 'skipped';
        let writeWebhookId = null;
        if (options.checkWrite) {
            writeWebhookId = await createAndDeletePermissionWebhook({
                storeUrl,
                consumerKey,
                consumerSecret,
            });
            writeCheck = 'created_and_deleted_paused_webhook';
        }
        const firstOrder = Array.isArray(orders) ? orders[0] : null;
        const activeWebhooks = Array.isArray(webhooks)
            ? webhooks.filter((webhook) => String(webhook?.status || '').toLowerCase() === 'active').length
            : 0;
        const summary = {
            mode: options.mock ? 'mock' : 'live',
            storeUrl,
            apiBase: getWooApiBase(storeUrl),
            consumerKey: maskKey(consumerKey),
            storeName: systemStatus?.environment?.site_title ||
                systemStatus?.environment?.site_url ||
                new URL(storeUrl).hostname,
            currency: systemStatus?.settings?.currency || systemStatus?.currency || null,
            ordersFetched: Array.isArray(orders) ? orders.length : 0,
            firstOrder: firstOrder
                ? {
                    id: firstOrder.id,
                    number: firstOrder.number,
                    status: firstOrder.status,
                    total: Number(firstOrder.total || 0),
                }
                : null,
            webhooksListed: Array.isArray(webhooks) ? webhooks.length : 0,
            activeWebhooks,
            writeCheck,
            writeWebhookId,
            calls: mockServer
                ? {
                    systemStatus: mockServer.captured.filter((call) => call.path === '/wp-json/wc/v3/system_status').length,
                    orders: mockServer.captured.filter((call) => call.path === '/wp-json/wc/v3/orders')
                        .length,
                    webhookList: mockServer.captured.filter((call) => call.method === 'GET' && call.path === '/wp-json/wc/v3/webhooks').length,
                    webhookCreate: mockServer.captured.filter((call) => call.method === 'POST' && call.path === '/wp-json/wc/v3/webhooks').length,
                    webhookDelete: mockServer.captured.filter((call) => call.method === 'DELETE' && call.path.includes('/wp-json/wc/v3/webhooks/')).length,
                }
                : undefined,
        };
        console.log('WooCommerce API checks passed');
        console.log(JSON.stringify(summary, null, 2));
    }
    finally {
        await mockServer?.close();
    }
};
main().catch((error) => {
    const responseMessage = error?.response?.data?.message ||
        error?.response?.data?.errors?.[0]?.message ||
        error?.message ||
        String(error);
    console.error('WooCommerce API checks failed');
    console.error(responseMessage);
    process.exit(1);
});
