"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const socketServer_1 = require("./config/socketServer");
const delhivery_webhook_1 = require("./controllers/webhooks/delhivery.webhook");
const amazonShipping_webhook_1 = require("./controllers/webhooks/amazonShipping.webhook");
const amazonShippingWebhook_1 = require("./config/amazonShippingWebhook");
const ekart_webhook_1 = require("./controllers/webhooks/ekart.webhook");
const shadowfax_webhook_1 = require("./controllers/webhooks/shadowfax.webhook");
const xpressbees_webhook_1 = require("./controllers/webhooks/xpressbees.webhook");
const indiaPost_webhook_1 = require("./controllers/webhooks/indiaPost.webhook");
const shopify_controller_1 = require("./controllers/shopify.controller");
const woocommerce_controller_1 = require("./controllers/woocommerce.controller");
const adminCourier_routes_1 = __importDefault(require("./routes/adminRoutes/adminCourier.routes"));
const adminSupport_routes_1 = __importDefault(require("./routes/adminRoutes/adminSupport.routes"));
const adminUser_routes_1 = __importDefault(require("./routes/adminRoutes/adminUser.routes"));
const adminWallet_routes_1 = __importDefault(require("./routes/adminRoutes/adminWallet.routes"));
const b2b_routes_1 = __importDefault(require("./routes/adminRoutes/b2b.routes"));
const billingInvoice_admin_routes_1 = __importDefault(require("./routes/adminRoutes/billingInvoice.admin.routes"));
const billingPreferences_admin_routes_1 = __importDefault(require("./routes/adminRoutes/billingPreferences.admin.routes"));
const codRemittance_admin_routes_1 = __importDefault(require("./routes/adminRoutes/codRemittance.admin.routes"));
const developer_routes_1 = __importDefault(require("./routes/adminRoutes/developer.routes"));
const location_routes_1 = __importDefault(require("./routes/adminRoutes/location.routes"));
const order_routes_1 = __importDefault(require("./routes/adminRoutes/order.routes"));
const paymentOptions_admin_routes_1 = __importDefault(require("./routes/adminRoutes/paymentOptions.admin.routes"));
const plan_routes_1 = __importDefault(require("./routes/adminRoutes/plan.routes"));
const weightReconciliation_admin_routes_1 = __importDefault(require("./routes/adminRoutes/weightReconciliation.admin.routes"));
const zone_routes_1 = __importDefault(require("./routes/adminRoutes/zone.routes"));
const franchise_routes_1 = __importDefault(require("./routes/adminRoutes/franchise.routes"));
const manualCourier_routes_1 = __importDefault(require("./routes/adminRoutes/manualCourier.routes"));
const indiaPost_routes_1 = __importDefault(require("./routes/adminRoutes/indiaPost.routes"));
const adminCrm_routes_1 = __importDefault(require("./routes/adminRoutes/adminCrm.routes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const bank_routes_1 = __importDefault(require("./routes/bank.routes"));
const billingInvoice_routes_1 = __importDefault(require("./routes/billingInvoice.routes"));
const billingPreferences_routes_1 = __importDefault(require("./routes/billingPreferences.routes"));
const blogs_routes_1 = __importDefault(require("./routes/blogs.routes"));
const codRemittance_routes_1 = __importDefault(require("./routes/codRemittance.routes"));
const courier_routes_1 = __importDefault(require("./routes/courier.routes"));
const courierPriority_routes_1 = __importDefault(require("./routes/courierPriority.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const externalApi_routes_1 = __importDefault(require("./routes/externalApi.routes"));
const globalSearch_routes_1 = __importDefault(require("./routes/globalSearch.routes"));
const integrationRoutes_1 = __importDefault(require("./routes/integrationRoutes"));
const invoice_routes_1 = __importDefault(require("./routes/invoice.routes"));
const invoicePreferences_routes_1 = __importDefault(require("./routes/invoicePreferences.routes"));
const labelPreferences_routes_1 = __importDefault(require("./routes/labelPreferences.routes"));
const ndr_routes_1 = __importDefault(require("./routes/ndr.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const order_routes_2 = __importDefault(require("./routes/order.routes"));
const paymentOptions_routes_1 = __importDefault(require("./routes/paymentOptions.routes"));
const pickup_routes_1 = __importDefault(require("./routes/pickup.routes"));
const pickupAddresses_route_1 = __importDefault(require("./routes/pickupAddresses.route"));
const returns_routes_1 = __importDefault(require("./routes/returns.routes"));
const rto_routes_1 = __importDefault(require("./routes/rto.routes"));
const staticPages_routes_1 = __importDefault(require("./routes/staticPages.routes"));
const support_routes_1 = __importDefault(require("./routes/support.routes"));
const upload_route_1 = __importDefault(require("./routes/upload.route"));
const userProfileRoutes_1 = __importDefault(require("./routes/userProfileRoutes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const publicTools_routes_1 = __importDefault(require("./routes/publicTools.routes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const weightReconciliation_routes_1 = __importDefault(require("./routes/weightReconciliation.routes"));
const franchise_routes_2 = __importDefault(require("./routes/franchise.routes"));
// Routes imports
// import other routes here...
// Determine environment
const env = process.env.NODE_ENV || 'development';
// Load correct .env file
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../.env.${env}`) });
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app); // ✅ HTTP server for socket.io
exports.server = server;
// Init socket.io server
(0, socketServer_1.initSocketServer)(server);
const normalizeJsonCharsetHeader = (contentType) => contentType.replace(/charset=([^;]+)/i, (_match, charset) => `charset=${String(charset).trim().toLowerCase()}`);
const getSafeRequestPath = (req) => String(req?.originalUrl || req?.url || '').split('?')[0];
app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId = (0, crypto_1.randomUUID)();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
        if (durationMs >= 1000 || res.statusCode >= 500) {
            console.log('[HTTP]', {
                requestId,
                method: req.method,
                path: getSafeRequestPath(req),
                statusCode: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
            });
        }
    });
    next();
});
app.use((0, cookie_parser_1.default)());
app.use((req, _res, next) => {
    const contentType = req.headers['content-type'];
    if (typeof contentType === 'string' && /application\/json/i.test(contentType) && /charset=/i.test(contentType)) {
        req.headers['content-type'] = normalizeJsonCharsetHeader(contentType);
    }
    next();
});
const normalizeOrigin = (origin) => origin.trim().replace(/\/+$/, '').toLowerCase();
const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);
const allowedOrigins = new Set([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5176',
    'http://localhost:5177',
    'https://shipraylogistics.in',
    'https://www.shipraylogistics.in',
    'https://app.shipraylogistics.in',
    'https://admin.shipraylogistics.in',
    'https://franchise.shipraylogistics.in',
    ...configuredAllowedOrigins,
]);
const isAllowedOrigin = (origin) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.has(normalizedOrigin)) {
        return true;
    }
    // Allow first-party HTTPS subdomains like preview or alternate app hosts.
    return /^https:\/\/([a-z0-9-]+\.)*shipraylogistics\.in$/.test(normalizedOrigin);
};
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error(`Not allowed by CORS: ${origin}`));
        }
    },
    credentials: true,
    exposedHeaders: [
        'Content-Disposition',
        'X-Request-Id',
        'X-Shipray-Archive-Name',
        'X-Shipray-Requested-Count',
        'X-Shipray-Document-Count',
        'X-Shipray-Missing-Count',
        'X-Shipray-Deduplicated-Count',
    ],
}));
// Shopify webhooks require raw body for HMAC verification
app.post('/api/webhooks/shopify/order-created', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyOrderWebhookController);
app.post('/api/webhooks/shopify/compliance', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyComplianceWebhookController);
app.post('/api/webhooks/shopify/app-uninstalled', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyAppUninstalledWebhookController);
app.post('/api/webhook/shopify/orders', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyOrderWebhookController);
app.post('/api/webhook/shopify/compliance', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyComplianceWebhookController);
app.post('/api/webhook/woocommerce/orders', express_1.default.raw({ type: 'application/json' }), woocommerce_controller_1.wooCommerceOrderWebhookController);
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}));
app.use(express_1.default.urlencoded({ extended: true }));
const apiStatus = (_req, res) => res.json({
    success: true,
    name: 'Shipray API',
    status: 'online',
    apiBase: '/api',
    clientUrl: process.env.CLIENT_URL || 'https://app.shipraylogistics.in',
    adminUrl: process.env.ADMIN_URL || 'https://admin.shipraylogistics.in',
    franchisePortalUrl: process.env.FRANCHISE_PORTAL_URL || 'https://franchise.shipraylogistics.in',
});
app.get('/', apiStatus);
app.get('/api', apiStatus);
app.use('/api/user', userRoutes_1.default);
app.use('/api/profile', userProfileRoutes_1.default);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/integrations', integrationRoutes_1.default);
app.use('/api/payments', walletRoutes_1.default);
app.use('/api/uploads', upload_route_1.default);
app.use('/api/bank-account', bank_routes_1.default);
app.use('/api/pickup-addresses', pickupAddresses_route_1.default);
app.use('/api', pickup_routes_1.default);
app.use('/api', returns_routes_1.default);
app.use('/api/couriers', courier_routes_1.default);
app.use('/api/courier', courierPriority_routes_1.default);
app.use('/api/support', support_routes_1.default);
app.use('/api/admin', adminSupport_routes_1.default);
app.use('/api/admin/users', adminUser_routes_1.default);
app.use('/api/admin/orders', order_routes_1.default);
app.use('/api/admin/developer', developer_routes_1.default);
app.use('/api/admin/couriers', adminCourier_routes_1.default);
app.use('/api/admin/zones', zone_routes_1.default);
app.use('/api/admin/b2b', b2b_routes_1.default);
app.use('/api/notifications', notifications_routes_1.default);
app.use('/api/orders', order_routes_2.default);
app.use('/api', invoicePreferences_routes_1.default);
app.use('/api', invoice_routes_1.default);
app.use('/api', billingInvoice_routes_1.default);
app.use('/api', billingInvoice_admin_routes_1.default);
app.use('/api/blogs', blogs_routes_1.default);
app.use('/api/static-pages', staticPages_routes_1.default);
app.use('/api/public', publicTools_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/search', globalSearch_routes_1.default);
app.use('/api/serviceability', location_routes_1.default);
app.use('/api/user-management', employee_routes_1.default);
app.use('/api/label-preference', labelPreferences_routes_1.default);
app.use('/api/plans', plan_routes_1.default);
app.use('/api/billing-preferences', billingPreferences_routes_1.default);
app.use('/api/cod-remittance', codRemittance_routes_1.default);
app.use('/api/admin/cod-remittance', codRemittance_admin_routes_1.default);
app.use('/api/admin/weight-reconciliation', weightReconciliation_admin_routes_1.default);
app.use('/api/admin/wallets', adminWallet_routes_1.default);
app.use('/api/admin/payment-options', paymentOptions_admin_routes_1.default);
app.use('/api/admin/franchise/v1', franchise_routes_1.default);
app.use('/api/admin/manual-couriers', manualCourier_routes_1.default);
app.use('/api/admin/indiapost', indiaPost_routes_1.default);
app.use('/api/admin/crm', adminCrm_routes_1.default);
app.use('/api/admin/billing-preferences', billingPreferences_admin_routes_1.default);
app.use('/api/payment-options', paymentOptions_routes_1.default);
app.use('/api/weight-reconciliation', weightReconciliation_routes_1.default);
app.use('/api', ndr_routes_1.default);
app.use('/api', rto_routes_1.default);
app.use('/api/v1', externalApi_routes_1.default);
app.use('/api/franchise/v1', franchise_routes_2.default);
// Amazon Shipping tracking webhook. The public production URL is:
// https://api.shipraylogistics.in/webhooks/amazon-shipping/tracking
app.get(amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_PATH, amazonShipping_webhook_1.amazonShippingTrackingWebhookHealthHandler);
app.post(amazonShippingWebhook_1.AMAZON_SHIPPING_WEBHOOK_PATH, express_1.default.json(), amazonShipping_webhook_1.amazonShippingTrackingWebhookHandler);
app.post('/api/webhook/amazon-shipping/tracking', express_1.default.json(), amazonShipping_webhook_1.amazonShippingTrackingWebhookHandler);
// Ekart webhook
app.post('/api/webhook/ekart', express_1.default.json(), ekart_webhook_1.ekartWebhookHandler);
app.post('/api/webhook/ekart/track', express_1.default.json(), ekart_webhook_1.ekartWebhookHandler);
app.post('/api/webhook/xpressbees', express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}), xpressbees_webhook_1.xpressbeesWebhookHandler);
app.post('/api/webhook/xpressbees/track', express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}), xpressbees_webhook_1.xpressbeesWebhookHandler);
// Delhivery webhooks - separate endpoints for Scan Push and Document Push
app.post('/api/webhook/delhivery/scan', express_1.default.json(), delhivery_webhook_1.delhiveryScanPushHandler); // Scan Push (Status Updates)
app.post('/api/webhook/delhivery/document', express_1.default.json(), delhivery_webhook_1.delhiveryDocumentPushHandler); // Document Push (POD, Sorter Image, QC Image)
// Legacy unified endpoint (auto-detects type) - kept for backward compatibility
app.post('/api/webhook/delhivery/order', express_1.default.json(), delhivery_webhook_1.delhiveryWebhookHandler);
app.post('/api/webhook/shadowfax', express_1.default.json(), shadowfax_webhook_1.shadowfaxWebhookHandler);
app.post('/api/webhook/shadowfax/track', express_1.default.json(), shadowfax_webhook_1.shadowfaxWebhookHandler);
app.get('/api/webhooks/indiapost/events', indiaPost_webhook_1.indiaPostWebhookHealthHandler);
app.get('/api/webhooks/indiapost/booking', indiaPost_webhook_1.indiaPostWebhookHealthHandler);
app.get('/api/webhooks/indiapost/other', indiaPost_webhook_1.indiaPostWebhookHealthHandler);
app.post('/api/webhooks/indiapost/events', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('generic'));
app.post('/api/webhooks/indiapost/booking', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('booking'));
app.post('/api/webhooks/indiapost/other', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('other'));
app.post('/api/webhook/indiapost/events', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('generic'));
app.post('/api/webhook/indiapost/booking', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('booking'));
app.post('/api/webhook/indiapost/other', express_1.default.json(), (0, indiaPost_webhook_1.indiaPostWebhookHandler)('other'));
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    if (err?.type === 'entity.parse.failed') {
        console.warn('Invalid JSON payload', {
            requestId: req?.requestId ?? null,
            method: req?.method,
            path: getSafeRequestPath(req),
            message: err?.message || 'Malformed JSON',
        });
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON payload',
            requestId: req?.requestId ?? null,
        });
    }
    const statusCode = err?.message?.startsWith('Not allowed by CORS')
        ? 403
        : typeof err?.statusCode === 'number'
            ? err.statusCode
            : 500;
    console.error('❌ Unhandled request error', {
        requestId: req?.requestId ?? null,
        method: req?.method,
        path: getSafeRequestPath(req),
        statusCode,
        message: err?.message || String(err),
        stack: err?.stack,
    });
    return res.status(statusCode).json({
        success: false,
        message: statusCode === 500 ? 'Internal server error' : err?.message || 'Request failed',
        requestId: req?.requestId ?? null,
    });
});
