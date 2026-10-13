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
exports.deleteCourierController = exports.deleteShippingRateController = exports.importShippingRatesController = exports.updateShippingRateController = exports.numericToString = exports.updateAmazonCredentialsController = exports.updateShadowfaxCredentialsController = exports.updateXpressbeesCredentialsController = exports.updateEkartCredentialsController = exports.cancelDelhiveryLtlPickupRequestController = exports.createDelhiveryLtlPickupRequestController = exports.bookDelhiveryLtlLastMileAppointmentController = exports.getDelhiveryLtlGeneratedDocumentStatusController = exports.generateDelhiveryLtlDocumentsController = exports.getDelhiveryLtlLrCopyController = exports.getDelhiveryLtlShippingLabelUrlsController = exports.trackDelhiveryLtlShipmentController = exports.cancelDelhiveryLtlShipmentController = exports.getDelhiveryLtlShipmentUpdateStatusController = exports.updateDelhiveryLtlShipmentController = exports.getDelhiveryLtlManifestStatusController = exports.createDelhiveryLtlManifestController = exports.updateDelhiveryLtlClientWarehouseController = exports.createDelhiveryLtlClientWarehouseController = exports.getDelhiveryLtlFreightChargesController = exports.estimateDelhiveryLtlFreightController = exports.getDelhiveryLtlExpectedTatController = exports.checkDelhiveryLtlServiceabilityController = exports.logoutDelhiveryLtlController = exports.loginDelhiveryLtlController = exports.requestDelhiveryLtlPasswordResetController = exports.testDelhiveryCredentialsController = exports.updateDelhiveryCredentialsController = exports.velocityOperationController = exports.loadVelocityCouriersController = exports.testVelocityCredentialsController = exports.updateVelocityCredentialsController = exports.updateXpressbeesAwbRangeController = exports.getCourierCredentialsController = exports.updateServiceProviderStatusController = exports.getServiceProvidersController = exports.updateCourierStatusController = exports.getAllCouriersListController = exports.getAllCouriersController = exports.getShippingRatesController = exports.fetchAvailableCouriersForAdmin = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const XLSX = __importStar(require("xlsx"));
const client_1 = require("../../models/client");
const courierIntegration_service_1 = require("../../models/services/courierIntegration.service");
const rateCardImport_service_1 = require("../../models/services/rateCardImport.service");
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const courierCredentials_1 = require("../../models/schema/courierCredentials");
const couriers_1 = require("../../models/schema/couriers");
const zone_service_1 = require("../../models/services/zone.service");
const xpressbees_service_1 = require("../../models/services/couriers/xpressbees.service");
const shadowfax_service_1 = require("../../models/services/couriers/shadowfax.service");
const xpressbeesAwbRange_service_1 = require("../../models/services/xpressbeesAwbRange.service");
const amazonShippingCredentials_service_1 = require("../../models/services/amazonShippingCredentials.service");
const delhivery_service_1 = require("../../models/services/couriers/delhivery.service");
const velocity_service_1 = require("../../models/services/couriers/velocity.service");
const ADMIN_VISIBLE_COURIER_PROVIDERS = ['delhivery', 'velocity'];
const fetchAvailableCouriersForAdmin = async (req, res) => {
    try {
        const { origin, destination, payment_type, order_amount, weight, length, breadth, height, shipment_type, plan_id, isCalculator, context, shadowfax_forward_mode, shadowfaxForwardMode, shadowfax_service_mode, shadowfaxServiceMode, } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRatesAdmin)({
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: order_amount,
            shipment_type: shipment_type,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            isCalculator: isCalculator === true || context === 'rate_calculator',
            shadowfax_forward_mode: shadowfax_forward_mode ?? shadowfaxForwardMode,
            shadowfax_service_mode: shadowfax_service_mode ?? shadowfaxServiceMode,
        }, plan_id);
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriersForAdmin = fetchAvailableCouriersForAdmin;
const getShippingRatesController = async (req, res) => {
    try {
        let courierNames = [];
        const rawCourierNames = req.query['courier_name[]'] ?? req.query.courier_name;
        const normalizeQueryList = (value) => (Array.isArray(value) ? value : [value])
            .flat()
            .flatMap((item) => String(item || '').split(','))
            .map((item) => item.trim())
            .filter(Boolean);
        courierNames = normalizeQueryList(rawCourierNames);
        const requestedBusinessType = req.query.businessType || undefined;
        const parsedMinWeight = Number(req.query.min_weight);
        const filters = {
            courier_name: courierNames.length ? courierNames : undefined,
            mode: req.query.mode,
            min_weight: requestedBusinessType?.toLowerCase() === 'b2c'
                ? undefined
                : Number.isFinite(parsedMinWeight)
                    ? parsedMinWeight
                    : undefined,
            plan_id: req.query.planId,
            business_type: requestedBusinessType,
        };
        const rates = await (0, courierIntegration_service_1.getShippingRates)(filters);
        res.json({ success: true, data: rates });
    }
    catch (err) {
        console.error('Error fetching shipping rates:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.getShippingRatesController = getShippingRatesController;
const getAllCouriersController = async (req, res) => {
    try {
        const courierList = await client_1.db
            .select({
            id: couriers_1.couriers.id,
            name: couriers_1.couriers.name,
            serviceProvider: couriers_1.couriers.serviceProvider,
            isEnabled: couriers_1.couriers.isEnabled,
            createdAt: couriers_1.couriers.createdAt,
        })
            .from(couriers_1.couriers)
            .where((0, drizzle_orm_1.inArray)(couriers_1.couriers.serviceProvider, ADMIN_VISIBLE_COURIER_PROVIDERS))
            .orderBy((0, drizzle_orm_1.desc)(couriers_1.couriers.createdAt));
        res.json({ success: true, data: courierList });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};
exports.getAllCouriersController = getAllCouriersController;
const getAllCouriersListController = async (req, res) => {
    try {
        const { search, serviceProvider, businessType } = req.query;
        const whereClauses = [(0, drizzle_orm_1.inArray)(couriers_1.couriers.serviceProvider, ADMIN_VISIBLE_COURIER_PROVIDERS)];
        // Filter by search (name or id)
        if (search && typeof search === 'string' && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            whereClauses.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(couriers_1.couriers.name, searchTerm), (0, drizzle_orm_1.sql) `CAST(${couriers_1.couriers.id} AS TEXT) ILIKE ${searchTerm}`));
        }
        // Filter by service provider
        if (serviceProvider && typeof serviceProvider === 'string' && serviceProvider.trim()) {
            const normalizedProvider = serviceProvider.trim().toLowerCase();
            if (!ADMIN_VISIBLE_COURIER_PROVIDERS.includes(normalizedProvider)) {
                return res.json({ success: true, data: [] });
            }
            whereClauses.push((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, normalizedProvider));
        }
        // Filter by business type (b2c or b2b)
        if (businessType && typeof businessType === 'string') {
            const normalizedBusinessType = businessType.trim().toLowerCase();
            if (normalizedBusinessType === 'b2c' || normalizedBusinessType === 'b2b') {
                // Construct JSONB array string - value is validated above (only 'b2c' or 'b2b')
                const jsonbArrayStr = JSON.stringify([normalizedBusinessType]);
                // Match the pattern from shiprocket.service.ts - construct the full JSONB literal
                whereClauses.push((0, drizzle_orm_1.sql) `${couriers_1.couriers.businessType} @> ${drizzle_orm_1.sql.raw(`'${jsonbArrayStr.replace(/'/g, "''")}'::jsonb`)}`);
            }
        }
        const whereCondition = whereClauses.length > 0 ? (0, drizzle_orm_1.and)(...whereClauses) : undefined;
        const courierList = await client_1.db
            .select()
            .from(couriers_1.couriers)
            .where(whereCondition)
            .orderBy((0, drizzle_orm_1.desc)(couriers_1.couriers.createdAt));
        res.json({ success: true, data: courierList });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch couriers' });
    }
};
exports.getAllCouriersListController = getAllCouriersListController;
const updateCourierStatusController = async (req, res) => {
    const { id } = req.params;
    const { serviceProvider, isEnabled, businessType } = req.body;
    try {
        if (!serviceProvider) {
            return res.status(400).json({
                success: false,
                message: 'serviceProvider is required',
            });
        }
        // Build update object
        const updateData = {
            updatedAt: new Date(),
        };
        // Update isEnabled if provided
        if (typeof isEnabled === 'boolean') {
            updateData.isEnabled = isEnabled;
        }
        // Update businessType if provided
        if (businessType && Array.isArray(businessType) && businessType.length > 0) {
            // Validate businessType values
            const validTypes = businessType.filter((type) => type === 'b2c' || type === 'b2b');
            if (validTypes.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'businessType must contain at least one valid value: "b2c" or "b2b"',
                });
            }
            updateData.businessType = validTypes;
        }
        // Check if there's anything to update
        if (Object.keys(updateData).length === 1) {
            // Only updatedAt was added, nothing to update
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update. Provide isEnabled and/or businessType',
            });
        }
        const updated = await client_1.db
            .update(couriers_1.couriers)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(id)), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider)))
            .returning();
        if (!updated.length) {
            return res.status(404).json({ success: false, message: 'Courier not found' });
        }
        res.json({ success: true, data: updated[0] });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update courier' });
    }
};
exports.updateCourierStatusController = updateCourierStatusController;
const getServiceProvidersController = async (req, res) => {
    try {
        // Only expose the providers actively managed in the admin courier UI.
        const allowedProviders = ADMIN_VISIBLE_COURIER_PROVIDERS;
        const rows = await client_1.db
            .select({
            serviceProvider: couriers_1.couriers.serviceProvider,
            totalCouriers: (0, drizzle_orm_1.sql) `count(*)`,
            enabledCouriers: (0, drizzle_orm_1.sql) `sum(case when ${couriers_1.couriers.isEnabled} then 1 else 0 end)`,
        })
            .from(couriers_1.couriers)
            .where((0, drizzle_orm_1.inArray)(couriers_1.couriers.serviceProvider, allowedProviders))
            .groupBy(couriers_1.couriers.serviceProvider)
            .orderBy(couriers_1.couriers.serviceProvider);
        const byProvider = new Map(rows.map((row) => [
            row.serviceProvider,
            {
                serviceProvider: row.serviceProvider,
                totalCouriers: Number(row.totalCouriers || 0),
                enabledCouriers: Number(row.enabledCouriers || 0),
                isEnabled: Number(row.enabledCouriers || 0) > 0,
            },
        ]));
        // Ensure allowed providers are always visible in admin UI,
        // even when no rows exist in couriers table yet.
        const providers = allowedProviders.map((provider) => ({
            serviceProvider: provider,
            totalCouriers: byProvider.get(provider)?.totalCouriers ?? 0,
            enabledCouriers: byProvider.get(provider)?.enabledCouriers ?? 0,
            isEnabled: byProvider.get(provider)?.isEnabled ?? false,
        }));
        res.json({ success: true, data: providers });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch service providers' });
    }
};
exports.getServiceProvidersController = getServiceProvidersController;
const updateServiceProviderStatusController = async (req, res) => {
    const { serviceProvider } = req.params;
    const { isEnabled } = req.body;
    try {
        const allowedProviders = ADMIN_VISIBLE_COURIER_PROVIDERS;
        if (!serviceProvider || typeof isEnabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'serviceProvider (param) and boolean isEnabled (body) are required',
            });
        }
        if (!allowedProviders.includes(String(serviceProvider).toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Only these providers are supported: ${allowedProviders.join(', ')}`,
            });
        }
        const updated = await client_1.db
            .update(couriers_1.couriers)
            .set({
            isEnabled,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider))
            .returning();
        if (!updated.length) {
            return res.status(404).json({ success: false, message: 'No couriers found for provider' });
        }
        res.json({
            success: true,
            data: {
                serviceProvider,
                isEnabled,
                affectedCouriers: updated.length,
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update service provider status' });
    }
};
exports.updateServiceProviderStatusController = updateServiceProviderStatusController;
const buildAmazonCredentialResponse = (row) => {
    const credentials = (0, amazonShippingCredentials_service_1.buildAmazonShippingCredentialsFromRow)(row);
    const accessToken = (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.accessToken);
    const refreshToken = (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.refreshToken);
    const lwaClientId = (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.lwaClientId);
    const lwaClientSecret = (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.lwaClientSecret);
    return {
        provider: amazonShippingCredentials_service_1.AMAZON_CREDENTIALS_PROVIDER,
        apiBase: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.endpoint),
        endpoint: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.endpoint),
        lwaClientId,
        shippingBusinessId: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.shippingBusinessId) || amazonShippingCredentials_service_1.AMAZON_DEFAULT_BUSINESS_ID,
        region: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.region) || amazonShippingCredentials_service_1.AMAZON_DEFAULT_REGION,
        sandbox: Boolean(credentials.sandbox),
        lwaTokenUrl: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(credentials.lwaTokenUrl),
        hasAccessToken: Boolean(accessToken),
        accessTokenMasked: (0, amazonShippingCredentials_service_1.maskAmazonCredential)(accessToken),
        hasRefreshToken: Boolean(refreshToken),
        refreshTokenMasked: (0, amazonShippingCredentials_service_1.maskAmazonCredential)(refreshToken),
        hasLwaClientSecret: Boolean(lwaClientSecret),
        configured: Boolean(accessToken || (refreshToken && lwaClientId && lwaClientSecret)),
    };
};
const optionalCredentialString = (value) => typeof value === 'string' ? value.trim() : undefined;
const maskCourierCredential = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized)
        return '';
    if (normalized.length <= 8)
        return '*'.repeat(normalized.length);
    return `${normalized.slice(0, 4)}${'*'.repeat(Math.max(normalized.length - 8, 0))}${normalized.slice(-4)}`;
};
const parseCourierControllerJsonValue = (value, fallback) => {
    if (value === undefined || value === null || value === '')
        return fallback;
    if (typeof value !== 'string')
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
};
const normalizePublicUrl = (value, fallback) => {
    const normalized = String(value || fallback).trim();
    return normalized.replace(/\/+$/, '');
};
const getPublicApiUrl = () => normalizePublicUrl(process.env.API_URL || process.env.PUBLIC_API_URL, 'https://api.shipray.com');
const resolvePublicWebhookUrl = (envName, path) => {
    const configured = optionalCredentialString(process.env[envName]);
    if (configured) {
        return /^https?:\/\//i.test(configured)
            ? normalizePublicUrl(configured, configured)
            : `${getPublicApiUrl()}/${configured.replace(/^\/+/, '')}`;
    }
    return `${getPublicApiUrl()}${path}`;
};
const buildDelhiveryWebhookConfig = () => ({
    scanPushUrl: resolvePublicWebhookUrl('DELHIVERY_SCAN_PUSH_WEBHOOK_URL', '/api/webhook/delhivery/scan'),
    documentPushUrl: resolvePublicWebhookUrl('DELHIVERY_DOCUMENT_PUSH_WEBHOOK_URL', '/api/webhook/delhivery/document'),
    legacyUnifiedUrl: resolvePublicWebhookUrl('DELHIVERY_LEGACY_WEBHOOK_URL', '/api/webhook/delhivery/order'),
    method: 'POST',
    contentType: 'application/json',
    expectedResponse: '200 OK',
    requiredFields: [
        'Shipment.AWB',
        'Shipment.ReferenceNo',
        'Shipment.Status.Status',
        'Shipment.Status.StatusType',
        'Shipment.Status.Instructions',
        'Shipment.NSLCode or Shipment.Status.StatusCode',
    ],
});
const getCourierCredentialsController = async (req, res) => {
    try {
        const xpressbeesManualAwb = await (0, xpressbeesAwbRange_service_1.getXpressbeesManualAwbSummary)().catch((err) => {
            console.warn('Failed to load Xpressbees manual AWB summary:', err?.message || err);
            return {
                configured: false,
                active: false,
                range: null,
                recentAllocations: [],
            };
        });
        const rows = await client_1.db
            .select({
            provider: courierCredentials_1.courier_credentials.provider,
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientName: courierCredentials_1.courier_credentials.clientName,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            clientId: courierCredentials_1.courier_credentials.clientId,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
            metadata: courierCredentials_1.courier_credentials.metadata,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.inArray)(courierCredentials_1.courier_credentials.provider, [
            'delhivery',
            'velocity',
        ]));
        const defaults = {
            delhivery: {
                provider: 'delhivery',
                apiBase: 'https://track.delhivery.com',
                clientName: '',
                ltlApiBase: 'https://ltl-clients-api.delhivery.com',
                ltlUsername: '',
                hasApiKey: false,
                apiKeyMasked: '',
                hasLtlUsername: false,
                hasLtlPassword: false,
                hasLtlToken: false,
                ltlTokenMasked: '',
                ltlTokenExpiresAt: '',
                webhookConfig: buildDelhiveryWebhookConfig(),
            },
            ekart: {
                provider: 'ekart',
                apiBase: 'https://api.ekartlogistics.com',
                clientId: '',
                username: '',
                hasPassword: false,
                hasWebhookSecret: false,
            },
            xpressbees: {
                provider: 'xpressbees',
                apiBase: 'https://shipment.xpressbees.com',
                username: '',
                hasApiKey: false,
                apiKeyMasked: '',
                hasPassword: false,
                hasAuthBearer: false,
                hasSecretKey: false,
                hasXbKey: false,
                hasXbAccessKey: false,
                businessAccountName: '',
                pickupVendorCode: '',
                businessUnit: 'ECOM',
                businessFlow: 'FORWARD',
                businessService: '',
                businessServices: 'SD,SDD,NDD,AIR,SFC,IntraSDD',
                hasWebhookSecret: false,
                pincodeBusinessUnit: 'eComm',
                pincodeBusinessFlow: 'Forward',
                pickupBusinessService: 'PickUp',
                deliveryBusinessService: 'Delivery',
                serviceabilityVersion: 'v1',
                trackingVersion: 'v1',
                manualAwb: xpressbeesManualAwb,
            },
            shadowfax: {
                provider: 'shadowfax',
                apiBase: 'https://dale.staging.shadowfax.in/api',
                clientName: '',
                hasApiKey: false,
                apiKeyMasked: '',
                hasWebhookSecret: false,
            },
            velocity: {
                provider: 'velocity',
                apiBase: '',
                username: '',
                hasPassword: false,
                hasAuthorizationToken: false,
                authorizationScheme: 'raw',
            },
            amazon: buildAmazonCredentialResponse(),
        };
        const data = rows.reduce((acc, row) => {
            const provider = (row.provider || '').toLowerCase();
            if (!provider)
                return acc;
            if (provider === 'delhivery') {
                const apiKey = row.apiKey || '';
                const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                const ltlApiBase = String(metadata.ltlApiBase || metadata.ltl_api_base || 'https://ltl-clients-api.delhivery.com').trim();
                const ltlUsername = String(metadata.ltlUsername || metadata.ltl_username || '').trim();
                const ltlPassword = String(metadata.ltlPassword || metadata.ltl_password || '').trim();
                const ltlToken = String(metadata.ltlToken || metadata.ltl_token || '').trim();
                const ltlTokenExpiresAt = String(metadata.ltlTokenExpiresAt || metadata.ltl_token_expires_at || '').trim();
                acc.delhivery = {
                    provider: 'delhivery',
                    apiBase: row.apiBase || 'https://track.delhivery.com',
                    clientName: row.clientName || '',
                    ltlApiBase,
                    ltlUsername,
                    hasApiKey: Boolean(apiKey.trim()),
                    hasLtlUsername: Boolean(ltlUsername),
                    hasLtlPassword: Boolean(ltlPassword),
                    hasLtlToken: Boolean(ltlToken),
                    ltlTokenMasked: maskCourierCredential(ltlToken),
                    ltlTokenExpiresAt,
                    apiKeyMasked: apiKey
                        ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
                        : '',
                    webhookConfig: buildDelhiveryWebhookConfig(),
                };
            }
            else if (provider === 'ekart') {
                const hasPassword = Boolean((row.password || '').trim());
                const hasWebhookSecret = Boolean((row.webhookSecret || '').trim());
                acc.ekart = {
                    provider: 'ekart',
                    apiBase: row.apiBase || 'https://api.ekartlogistics.com',
                    clientId: row.clientId || '',
                    username: row.username || '',
                    hasPassword,
                    hasWebhookSecret,
                };
            }
            else if (provider === 'xpressbees') {
                const apiKey = row.apiKey || '';
                const hasPassword = Boolean((row.password || '').trim());
                const hasWebhookSecret = Boolean((row.webhookSecret || '').trim());
                const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                const businessAccountName = String(metadata.businessAccountName || metadata.business_account_name || '').trim();
                const pickupVendorCode = String(metadata.pickupVendorCode || metadata.pickup_vendor_code || '').trim();
                acc.xpressbees = {
                    provider: 'xpressbees',
                    apiBase: row.apiBase || 'https://shipment.xpressbees.com',
                    username: row.username || '',
                    hasApiKey: Boolean(apiKey.trim()),
                    apiKeyMasked: apiKey
                        ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
                        : '',
                    hasPassword,
                    hasAuthBearer: Boolean(String(metadata.authBearer || metadata.auth_bearer || metadata.authorizationBearer || '').trim()),
                    hasSecretKey: Boolean(String(metadata.secretKey || metadata.secret_key || '').trim()),
                    hasXbKey: Boolean(String(metadata.xbKey || metadata.xb_key || '').trim()),
                    hasXbAccessKey: Boolean(String(metadata.xbAccessKey || metadata.xb_access_key || '').trim()),
                    businessAccountName,
                    pickupVendorCode,
                    hasBusinessAccountName: Boolean(businessAccountName),
                    hasPickupVendorCode: Boolean(pickupVendorCode),
                    businessUnit: metadata.businessUnit || 'ECOM',
                    businessFlow: metadata.businessFlow || 'FORWARD',
                    businessService: metadata.businessService || '',
                    businessServices: metadata.businessServices || 'SD,SDD,NDD,AIR,SFC,IntraSDD',
                    manifestServiceType: metadata.manifestServiceType || 'SD',
                    manifestPickupType: metadata.manifestPickupType || 'Vendor',
                    hasWebhookSecret,
                    pincodeBusinessUnit: metadata.pincodeBusinessUnit || 'eComm',
                    pincodeBusinessFlow: metadata.pincodeBusinessFlow || 'Forward',
                    pickupBusinessService: metadata.pickupBusinessService || 'PickUp',
                    deliveryBusinessService: metadata.deliveryBusinessService || 'Delivery',
                    serviceabilityVersion: metadata.serviceabilityVersion || 'v1',
                    trackingVersion: metadata.trackingVersion || 'v1',
                    manualAwb: xpressbeesManualAwb,
                };
            }
            else if (provider === 'shadowfax') {
                const apiKey = row.apiKey || '';
                const hasWebhookSecret = Boolean((row.webhookSecret || '').trim());
                acc.shadowfax = {
                    provider: 'shadowfax',
                    apiBase: row.apiBase || 'https://dale.staging.shadowfax.in/api',
                    clientName: row.clientName || '',
                    hasApiKey: Boolean(apiKey.trim()),
                    apiKeyMasked: apiKey
                        ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
                        : '',
                    hasWebhookSecret,
                };
            }
            else if (provider === 'velocity') {
                const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
                const username = String(row.username || '').trim();
                const password = String(row.password || '').trim();
                acc.velocity = {
                    provider: 'velocity',
                    apiBase: row.apiBase || '',
                    username,
                    hasPassword: Boolean(password),
                    hasAuthorizationToken: Boolean(String(metadata.lastToken || '').trim()),
                    authorizationScheme: String(metadata.authorizationScheme || 'raw').toLowerCase() === 'bearer'
                        ? 'bearer'
                        : 'raw',
                };
            }
            else if (provider === amazonShippingCredentials_service_1.AMAZON_CREDENTIALS_PROVIDER) {
                acc.amazon = buildAmazonCredentialResponse(row);
            }
            return acc;
        }, { ...defaults });
        res.json({
            success: true,
            data,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch courier credentials' });
    }
};
exports.getCourierCredentialsController = getCourierCredentialsController;
const updateXpressbeesAwbRangeController = async (req, res) => {
    try {
        const result = await (0, xpressbeesAwbRange_service_1.createXpressbeesManualAwbRange)({
            startAwb: req.body?.startAwb ?? req.body?.awbStartNumber ?? req.body?.start,
            endAwb: req.body?.endAwb ?? req.body?.awbEndNumber ?? req.body?.end,
            createdBy: req.user?.sub || null,
        });
        res.json({
            success: true,
            message: 'Xpressbees manual AWB range updated successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to update Xpressbees manual AWB range:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to update Xpressbees manual AWB range',
        });
    }
};
exports.updateXpressbeesAwbRangeController = updateXpressbeesAwbRangeController;
const updateVelocityCredentialsController = async (req, res) => {
    const { apiBase, username, password } = req.body || {};
    try {
        const nextUsername = typeof username === 'string' ? username.trim() : '';
        const nextPassword = typeof password === 'string' ? password.trim() : '';
        if (!nextUsername) {
            return res.status(400).json({ success: false, message: 'Velocity username is required' });
        }
        const [existing] = await client_1.db
            .select({
            id: courierCredentials_1.courier_credentials.id,
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            password: courierCredentials_1.courier_credentials.password,
            metadata: courierCredentials_1.courier_credentials.metadata,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'velocity'))
            .limit(1);
        const metadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
        const requestedApiBase = typeof apiBase === 'string' ? apiBase.trim() : '';
        const nextApiBase = requestedApiBase || existing?.apiBase || process.env.VELOCITY_API_BASE || '';
        if (nextApiBase) {
            try {
                const parsed = new URL(nextApiBase);
                if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
                    return res.status(400).json({ success: false, message: 'Velocity API base URL must use HTTPS in production' });
                }
            }
            catch {
                return res.status(400).json({ success: false, message: 'Velocity API base URL must be a valid URL' });
            }
        }
        const nextMetadata = {
            ...metadata,
            authorizationScheme: 'raw',
        };
        const values = {
            apiBase: nextApiBase,
            username: nextUsername,
            ...(nextPassword ? { password: nextPassword } : {}),
            metadata: nextMetadata,
            updatedAt: new Date(),
        };
        if (existing) {
            await client_1.db.update(courierCredentials_1.courier_credentials).set(values).where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'velocity'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'velocity',
                apiBase: nextApiBase,
                clientName: '',
                apiKey: '',
                clientId: '',
                username: nextUsername,
                password: nextPassword,
                webhookSecret: '',
                metadata: nextMetadata,
            });
        }
        res.json({
            success: true,
            message: 'Velocity credentials updated successfully',
            data: {
                provider: 'velocity',
                username: nextUsername,
                hasPassword: Boolean(nextPassword || existing?.password),
            },
        });
    }
    catch (err) {
        console.error('Failed to update Velocity credentials:', err);
        res.status(500).json({ success: false, message: err?.message || 'Failed to update Velocity credentials' });
    }
};
exports.updateVelocityCredentialsController = updateVelocityCredentialsController;
const testVelocityCredentialsController = async (_req, res) => {
    try {
        const result = await (0, velocity_service_1.velocityGetToken)(true);
        res.json({ success: true, message: 'Velocity authentication succeeded', data: { expiresAt: result.expiresAt } });
    }
    catch (err) {
        console.error('Velocity authentication test failed:', err);
        res.status(502).json({ success: false, message: err?.message || 'Velocity authentication failed' });
    }
};
exports.testVelocityCredentialsController = testVelocityCredentialsController;
const loadVelocityCouriersController = async (req, res) => {
    const { from, to, payment_mode = 'prepaid', shipment_type = 'forward' } = req.body || {};
    if (!/^\d{6}$/.test(String(from || '')) || !/^\d{6}$/.test(String(to || ''))) {
        return res.status(400).json({ success: false, message: 'from and to must be valid six-digit pincodes' });
    }
    if (!['cod', 'prepaid'].includes(payment_mode) || !['forward', 'return'].includes(shipment_type)) {
        return res.status(400).json({ success: false, message: 'Invalid payment mode or shipment type' });
    }
    try {
        const response = await (0, velocity_service_1.velocityServiceability)({ from: String(from), to: String(to), payment_mode, shipment_type });
        const couriers = await (0, velocity_service_1.upsertVelocityCouriers)(response);
        res.json({ success: true, data: { response, couriers } });
    }
    catch (err) {
        console.error('Velocity courier sync failed:', err);
        res.status(502).json({ success: false, message: err?.message || 'Failed to load Velocity couriers' });
    }
};
exports.loadVelocityCouriersController = loadVelocityCouriersController;
const velocityOperationController = async (req, res) => {
    const operation = req.params.operation;
    if (!Object.prototype.hasOwnProperty.call(velocity_service_1.VELOCITY_ENDPOINTS, operation) || operation === 'authToken') {
        return res.status(400).json({ success: false, message: 'Unsupported Velocity operation' });
    }
    try {
        const data = await (0, velocity_service_1.velocityOperation)(operation, req.body && typeof req.body === 'object' ? req.body : {});
        res.json({ success: true, data });
    }
    catch (err) {
        console.error(`Velocity ${operation} failed:`, err);
        res.status(502).json({ success: false, message: err?.message || `Velocity ${operation} failed` });
    }
};
exports.velocityOperationController = velocityOperationController;
const updateDelhiveryCredentialsController = async (req, res) => {
    const { apiBase, clientName, apiKey, ltlApiBase, ltlUsername, ltlPassword } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined;
        const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined;
        const nextLtlApiBase = typeof ltlApiBase === 'string' ? ltlApiBase.trim() : undefined;
        const nextLtlUsername = typeof ltlUsername === 'string' ? ltlUsername.trim() : undefined;
        const nextLtlPassword = typeof ltlPassword === 'string' ? ltlPassword.trim() : undefined;
        const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
        const hasNewLtlPassword = typeof nextLtlPassword === 'string' && nextLtlPassword.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id, metadata: courierCredentials_1.courier_credentials.metadata })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://track.delhivery.com';
            }
            if (nextClientName !== undefined) {
                updatePayload.clientName = nextClientName;
            }
            if (hasNewApiKey) {
                updatePayload.apiKey = nextApiKey;
            }
            if (nextLtlApiBase !== undefined || nextLtlUsername !== undefined || hasNewLtlPassword) {
                const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
                updatePayload.metadata = {
                    ...existingMetadata,
                    ...(nextLtlApiBase !== undefined
                        ? { ltlApiBase: nextLtlApiBase || 'https://ltl-clients-api.delhivery.com' }
                        : {}),
                    ...(nextLtlUsername !== undefined ? { ltlUsername: nextLtlUsername } : {}),
                    ...(hasNewLtlPassword ? { ltlPassword: nextLtlPassword } : {}),
                };
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'delhivery',
                apiBase: nextApiBase || 'https://track.delhivery.com',
                clientName: nextClientName || '',
                apiKey: hasNewApiKey ? nextApiKey : '',
                metadata: {
                    ltlApiBase: nextLtlApiBase || 'https://ltl-clients-api.delhivery.com',
                    ltlUsername: nextLtlUsername || '',
                    ...(hasNewLtlPassword ? { ltlPassword: nextLtlPassword } : {}),
                },
            });
        }
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientName: courierCredentials_1.courier_credentials.clientName,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            metadata: courierCredentials_1.courier_credentials.metadata,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
            .limit(1);
        const savedMetadata = saved?.metadata && typeof saved.metadata === 'object' ? saved.metadata : {};
        const savedLtlApiBase = String(savedMetadata.ltlApiBase || savedMetadata.ltl_api_base || 'https://ltl-clients-api.delhivery.com').trim();
        const savedLtlUsername = String(savedMetadata.ltlUsername || savedMetadata.ltl_username || '').trim();
        const savedLtlPassword = String(savedMetadata.ltlPassword || savedMetadata.ltl_password || '').trim();
        const savedLtlToken = String(savedMetadata.ltlToken || savedMetadata.ltl_token || '').trim();
        const savedLtlTokenExpiresAt = String(savedMetadata.ltlTokenExpiresAt || savedMetadata.ltl_token_expires_at || '').trim();
        res.json({
            success: true,
            message: 'Delhivery credentials updated successfully',
            data: {
                provider: 'delhivery',
                apiBase: saved?.apiBase || 'https://track.delhivery.com',
                clientName: saved?.clientName || '',
                hasApiKey: Boolean((saved?.apiKey || '').trim()),
                ltlApiBase: savedLtlApiBase,
                ltlUsername: savedLtlUsername,
                hasLtlUsername: Boolean(savedLtlUsername),
                hasLtlPassword: Boolean(savedLtlPassword),
                hasLtlToken: Boolean(savedLtlToken),
                ltlTokenMasked: maskCourierCredential(savedLtlToken),
                ltlTokenExpiresAt: savedLtlTokenExpiresAt,
                webhookConfig: buildDelhiveryWebhookConfig(),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Delhivery credentials' });
    }
};
exports.updateDelhiveryCredentialsController = updateDelhiveryCredentialsController;
const testDelhiveryCredentialsController = async (req, res) => {
    const pincode = String(req.query?.pincode || req.body?.pincode || '').trim();
    if (!/^\d{6}$/.test(pincode)) {
        return res.status(400).json({
            success: false,
            message: 'A valid 6-digit pincode is required',
        });
    }
    try {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.checkServiceability(pincode);
        return res.json({
            success: true,
            message: 'Delhivery B2C credentials are working',
            data: {
                pincode,
                serviceability: result,
            },
        });
    }
    catch (err) {
        console.error('Failed to test Delhivery B2C credentials:', err);
        return res.status(502).json({
            success: false,
            message: err?.message || 'Delhivery B2C credential test failed',
        });
    }
};
exports.testDelhiveryCredentialsController = testDelhiveryCredentialsController;
const requestDelhiveryLtlPasswordResetController = async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.requestLtlPasswordReset(username);
        res.json({
            success: true,
            message: 'Delhivery LTL password reset request submitted successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to trigger Delhivery LTL password reset:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to trigger Delhivery LTL password reset',
        });
    }
};
exports.requestDelhiveryLtlPasswordResetController = requestDelhiveryLtlPasswordResetController;
const loginDelhiveryLtlController = async (req, res) => {
    try {
        const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined;
        const password = typeof req.body?.password === 'string' ? req.body.password.trim() : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.loginLtlAccount(username, password);
        res.json({
            success: true,
            message: 'Delhivery LTL login completed successfully',
            data: {
                username: result.username,
                hasLtlToken: Boolean(result.token),
                ltlTokenMasked: result.tokenMasked,
                ltlTokenExpiresAt: result.tokenExpiresAt,
                endpoint: result.endpoint,
            },
        });
    }
    catch (err) {
        console.error('Failed to log in to Delhivery LTL:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to log in to Delhivery LTL',
        });
    }
};
exports.loginDelhiveryLtlController = loginDelhiveryLtlController;
const logoutDelhiveryLtlController = async (req, res) => {
    try {
        const token = typeof req.body?.token === 'string'
            ? req.body.token.trim()
            : typeof req.headers?.authorization === 'string' &&
                req.headers.authorization.toLowerCase().startsWith('bearer ')
                ? req.headers.authorization.slice(7).trim()
                : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.logoutLtlAccount(token);
        res.json({
            success: true,
            message: 'Delhivery LTL logout completed successfully',
            data: {
                hasLtlToken: false,
                ltlTokenMasked: '',
                ltlTokenExpiresAt: '',
                endpoint: result.endpoint,
            },
        });
    }
    catch (err) {
        console.error('Failed to log out of Delhivery LTL:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to log out of Delhivery LTL',
        });
    }
};
exports.logoutDelhiveryLtlController = logoutDelhiveryLtlController;
const checkDelhiveryLtlServiceabilityController = async (req, res) => {
    try {
        const pincode = typeof req.query?.pincode === 'string'
            ? req.query.pincode.trim()
            : typeof req.body?.pincode === 'string'
                ? req.body.pincode.trim()
                : '';
        const rawWeight = typeof req.query?.weight === 'string'
            ? req.query.weight.trim()
            : typeof req.body?.weight === 'string' || typeof req.body?.weight === 'number'
                ? req.body.weight
                : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.checkLtlServiceability(pincode, rawWeight);
        res.json({
            success: true,
            message: 'Delhivery LTL serviceability fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL serviceability:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL serviceability',
        });
    }
};
exports.checkDelhiveryLtlServiceabilityController = checkDelhiveryLtlServiceabilityController;
const getDelhiveryLtlExpectedTatController = async (req, res) => {
    try {
        const originPin = typeof req.query?.origin_pin === 'string'
            ? req.query.origin_pin.trim()
            : typeof req.query?.originPin === 'string'
                ? req.query.originPin.trim()
                : typeof req.body?.origin_pin === 'string'
                    ? req.body.origin_pin.trim()
                    : typeof req.body?.originPin === 'string'
                        ? req.body.originPin.trim()
                        : '';
        const destinationPin = typeof req.query?.destination_pin === 'string'
            ? req.query.destination_pin.trim()
            : typeof req.query?.destinationPin === 'string'
                ? req.query.destinationPin.trim()
                : typeof req.body?.destination_pin === 'string'
                    ? req.body.destination_pin.trim()
                    : typeof req.body?.destinationPin === 'string'
                        ? req.body.destinationPin.trim()
                        : '';
        const requestId = typeof req.headers?.['x-request-id'] === 'string'
            ? req.headers['x-request-id'].trim()
            : typeof req.query?.requestId === 'string'
                ? req.query.requestId.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlExpectedTat(originPin, destinationPin, requestId);
        res.json({
            success: true,
            message: 'Delhivery LTL expected TAT fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL expected TAT:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL expected TAT',
        });
    }
};
exports.getDelhiveryLtlExpectedTatController = getDelhiveryLtlExpectedTatController;
const estimateDelhiveryLtlFreightController = async (req, res) => {
    try {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.estimateLtlFreight({
            dimensions: Array.isArray(req.body?.dimensions) ? req.body.dimensions : [],
            weight_g: req.body?.weight_g,
            cheque_payment: req.body?.cheque_payment === true,
            source_pin: String(req.body?.source_pin || '').trim(),
            consignee_pin: String(req.body?.consignee_pin || '').trim(),
            payment_mode: String(req.body?.payment_mode || '').trim(),
            cod_amount: req.body?.cod_amount,
            inv_amount: req.body?.inv_amount,
            freight_mode: req.body?.freight_mode,
            rov_insurance: req.body?.rov_insurance === true,
        });
        res.json({
            success: true,
            message: 'Delhivery LTL freight estimate fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL freight estimate:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL freight estimate',
        });
    }
};
exports.estimateDelhiveryLtlFreightController = estimateDelhiveryLtlFreightController;
const getDelhiveryLtlFreightChargesController = async (req, res) => {
    try {
        const lrns = typeof req.query?.lrns === 'string'
            ? req.query.lrns.trim()
            : Array.isArray(req.query?.lrns)
                ? req.query.lrns.map(String)
                : typeof req.body?.lrns === 'string' || Array.isArray(req.body?.lrns)
                    ? req.body.lrns
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlFreightCharges(lrns);
        res.json({
            success: true,
            message: 'Delhivery LTL freight charges fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL freight charges:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL freight charges',
        });
    }
};
exports.getDelhiveryLtlFreightChargesController = getDelhiveryLtlFreightChargesController;
const createDelhiveryLtlClientWarehouseController = async (req, res) => {
    try {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.createLtlClientWarehouse(req.body || {});
        res.json({
            success: true,
            message: 'Delhivery LTL client warehouse created successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to create Delhivery LTL client warehouse:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to create Delhivery LTL client warehouse',
        });
    }
};
exports.createDelhiveryLtlClientWarehouseController = createDelhiveryLtlClientWarehouseController;
const updateDelhiveryLtlClientWarehouseController = async (req, res) => {
    try {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.updateLtlClientWarehouse(req.body || {});
        res.json({
            success: true,
            message: 'Delhivery LTL client warehouse updated successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to update Delhivery LTL client warehouse:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to update Delhivery LTL client warehouse',
        });
    }
};
exports.updateDelhiveryLtlClientWarehouseController = updateDelhiveryLtlClientWarehouseController;
const createDelhiveryLtlManifestController = async (req, res) => {
    try {
        const payload = typeof req.body?.payload === 'string' && req.body.payload.trim()
            ? parseCourierControllerJsonValue(req.body.payload, {})
            : { ...(req.body || {}) };
        const parsedPayload = {
            ...payload,
            ...(payload.shipment_details === undefined && req.body?.shipment_details !== undefined
                ? {
                    shipment_details: parseCourierControllerJsonValue(req.body.shipment_details, req.body.shipment_details),
                }
                : {}),
            ...(payload.invoices === undefined && req.body?.invoices !== undefined
                ? {
                    invoices: parseCourierControllerJsonValue(req.body.invoices, req.body.invoices),
                }
                : {}),
            ...(payload.dropoff_location === undefined && req.body?.dropoff_location !== undefined
                ? {
                    dropoff_location: parseCourierControllerJsonValue(req.body.dropoff_location, req.body.dropoff_location),
                }
                : {}),
            ...(payload.return_address === undefined && req.body?.return_address !== undefined
                ? {
                    return_address: parseCourierControllerJsonValue(req.body.return_address, req.body.return_address),
                }
                : {}),
            ...(payload.dimensions === undefined && req.body?.dimensions !== undefined
                ? {
                    dimensions: parseCourierControllerJsonValue(req.body.dimensions, req.body.dimensions),
                }
                : {}),
            ...(payload.callback === undefined && req.body?.callback !== undefined
                ? {
                    callback: parseCourierControllerJsonValue(req.body.callback, req.body.callback),
                }
                : {}),
            ...(payload.doc_data === undefined && req.body?.doc_data !== undefined
                ? {
                    doc_data: parseCourierControllerJsonValue(req.body.doc_data, req.body.doc_data),
                }
                : {}),
            ...(payload.billing_address === undefined && req.body?.billing_address !== undefined
                ? {
                    billing_address: parseCourierControllerJsonValue(req.body.billing_address, req.body.billing_address),
                }
                : {}),
        };
        const files = Array.isArray(req.files) ? req.files : [];
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.createLtlManifest(parsedPayload, files);
        res.json({
            success: true,
            message: 'Delhivery LTL shipment creation submitted successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to create Delhivery LTL shipment:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to create Delhivery LTL shipment',
        });
    }
};
exports.createDelhiveryLtlManifestController = createDelhiveryLtlManifestController;
const getDelhiveryLtlManifestStatusController = async (req, res) => {
    try {
        const jobId = typeof req.query?.job_id === 'string'
            ? req.query.job_id.trim()
            : typeof req.query?.jobId === 'string'
                ? req.query.jobId.trim()
                : typeof req.query?.request_id === 'string'
                    ? req.query.request_id.trim()
                    : typeof req.body?.job_id === 'string'
                        ? req.body.job_id.trim()
                        : typeof req.body?.jobId === 'string'
                            ? req.body.jobId.trim()
                            : typeof req.body?.request_id === 'string'
                                ? req.body.request_id.trim()
                                : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlManifestStatus(jobId);
        res.json({
            success: true,
            message: 'Delhivery LTL shipment status fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL shipment status:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL shipment status',
        });
    }
};
exports.getDelhiveryLtlManifestStatusController = getDelhiveryLtlManifestStatusController;
const updateDelhiveryLtlShipmentController = async (req, res) => {
    try {
        const lrn = typeof req.params?.lrn === 'string'
            ? req.params.lrn.trim()
            : typeof req.body?.lrn === 'string'
                ? req.body.lrn.trim()
                : '';
        const payload = typeof req.body?.payload === 'string' && req.body.payload.trim()
            ? parseCourierControllerJsonValue(req.body.payload, {})
            : { ...(req.body || {}) };
        const parsedPayload = {
            ...payload,
            ...(payload.invoices === undefined && req.body?.invoices !== undefined
                ? {
                    invoices: parseCourierControllerJsonValue(req.body.invoices, req.body.invoices),
                }
                : {}),
            ...(payload.dimensions === undefined && req.body?.dimensions !== undefined
                ? {
                    dimensions: parseCourierControllerJsonValue(req.body.dimensions, req.body.dimensions),
                }
                : {}),
            ...((payload.invoice_files_meta === undefined ||
                payload.invoice_files_meta === null ||
                payload.invoice_files_meta === '') &&
                req.body?.invoice_files_meta !== undefined
                ? {
                    invoice_files_meta: parseCourierControllerJsonValue(req.body.invoice_files_meta, req.body.invoice_files_meta),
                }
                : {}),
            ...(payload.callback === undefined && req.body?.callback !== undefined
                ? {
                    callback: parseCourierControllerJsonValue(req.body.callback, req.body.callback),
                }
                : {}),
            ...(payload.cb === undefined && req.body?.cb !== undefined
                ? {
                    cb: parseCourierControllerJsonValue(req.body.cb, req.body.cb),
                }
                : {}),
        };
        const files = Array.isArray(req.files) ? req.files : [];
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.updateLtlShipment(lrn, parsedPayload, files);
        res.json({
            success: true,
            message: 'Delhivery LTL shipment updated successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to update Delhivery LTL shipment:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to update Delhivery LTL shipment',
        });
    }
};
exports.updateDelhiveryLtlShipmentController = updateDelhiveryLtlShipmentController;
const getDelhiveryLtlShipmentUpdateStatusController = async (req, res) => {
    try {
        const jobId = typeof req.query?.job_id === 'string'
            ? req.query.job_id.trim()
            : typeof req.query?.jobId === 'string'
                ? req.query.jobId.trim()
                : typeof req.body?.job_id === 'string'
                    ? req.body.job_id.trim()
                    : typeof req.body?.jobId === 'string'
                        ? req.body.jobId.trim()
                        : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlShipmentUpdateStatus(jobId);
        res.json({
            success: true,
            message: 'Delhivery LTL shipment update status fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL shipment update status:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL shipment update status',
        });
    }
};
exports.getDelhiveryLtlShipmentUpdateStatusController = getDelhiveryLtlShipmentUpdateStatusController;
const cancelDelhiveryLtlShipmentController = async (req, res) => {
    try {
        const lrn = typeof req.params?.lrn === 'string'
            ? req.params.lrn.trim()
            : typeof req.body?.lrn === 'string'
                ? req.body.lrn.trim()
                : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.cancelLtlShipment(lrn);
        res.json({
            success: true,
            message: 'Delhivery LTL shipment cancelled successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to cancel Delhivery LTL shipment:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to cancel Delhivery LTL shipment',
        });
    }
};
exports.cancelDelhiveryLtlShipmentController = cancelDelhiveryLtlShipmentController;
const trackDelhiveryLtlShipmentController = async (req, res) => {
    try {
        const lrnum = typeof req.query?.lrnum === 'string'
            ? req.query.lrnum.trim()
            : typeof req.body?.lrnum === 'string'
                ? req.body.lrnum.trim()
                : '';
        const trackId = typeof req.query?.track_id === 'string'
            ? req.query.track_id.trim()
            : typeof req.query?.trackId === 'string'
                ? req.query.trackId.trim()
                : typeof req.body?.track_id === 'string'
                    ? req.body.track_id.trim()
                    : typeof req.body?.trackId === 'string'
                        ? req.body.trackId.trim()
                        : '';
        const allWbns = typeof req.query?.all_wbns === 'string'
            ? req.query.all_wbns.trim()
            : typeof req.body?.all_wbns === 'string' ||
                typeof req.body?.all_wbns === 'boolean' ||
                typeof req.body?.all_wbns === 'number'
                ? req.body.all_wbns
                : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.trackLtlShipment({
            lrnum,
            track_id: trackId,
            all_wbns: allWbns,
        });
        res.json({
            success: true,
            message: 'Delhivery LTL shipment tracking fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL shipment tracking:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL shipment tracking',
        });
    }
};
exports.trackDelhiveryLtlShipmentController = trackDelhiveryLtlShipmentController;
const getDelhiveryLtlShippingLabelUrlsController = async (req, res) => {
    try {
        const size = typeof req.params?.size === 'string'
            ? req.params.size.trim()
            : typeof req.query?.size === 'string'
                ? req.query.size.trim()
                : typeof req.body?.size === 'string'
                    ? req.body.size.trim()
                    : '';
        const lrn = typeof req.params?.lrn === 'string'
            ? req.params.lrn.trim()
            : typeof req.query?.lrn === 'string'
                ? req.query.lrn.trim()
                : typeof req.body?.lrn === 'string'
                    ? req.body.lrn.trim()
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlShippingLabelUrls({ size, lrn });
        res.json({
            success: true,
            message: 'Delhivery LTL shipping label URLs fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL shipping label URLs:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL shipping label URLs',
        });
    }
};
exports.getDelhiveryLtlShippingLabelUrlsController = getDelhiveryLtlShippingLabelUrlsController;
const getDelhiveryLtlLrCopyController = async (req, res) => {
    try {
        const lrn = typeof req.params?.lrn === 'string'
            ? req.params.lrn.trim()
            : typeof req.query?.lrn === 'string'
                ? req.query.lrn.trim()
                : typeof req.body?.lrn === 'string'
                    ? req.body.lrn.trim()
                    : '';
        const lrCopyType = typeof req.query?.lr_copy_type === 'string'
            ? req.query.lr_copy_type.trim()
            : Array.isArray(req.body?.lr_copy_type) || typeof req.body?.lr_copy_type === 'string'
                ? req.body.lr_copy_type
                : undefined;
        const requestIdHeader = req.get('x-request-id');
        const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : typeof req.body?.request_id === 'string'
                ? req.body.request_id.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlLrCopy({
            lrn,
            lr_copy_type: lrCopyType,
            requestId,
        });
        res.json({
            success: true,
            message: 'Delhivery LTL LR copy fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL LR copy:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL LR copy',
        });
    }
};
exports.getDelhiveryLtlLrCopyController = getDelhiveryLtlLrCopyController;
const generateDelhiveryLtlDocumentsController = async (req, res) => {
    try {
        const docType = typeof req.params?.docType === 'string'
            ? req.params.docType.trim()
            : typeof req.body?.doc_type === 'string'
                ? req.body.doc_type.trim()
                : typeof req.body?.docType === 'string'
                    ? req.body.docType.trim()
                    : '';
        const requestIdHeader = req.get('x-request-id');
        const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : typeof req.body?.request_id === 'string'
                ? req.body.request_id.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.generateLtlDocuments(docType, req.body || {}, requestId);
        res.json({
            success: true,
            message: 'Delhivery LTL documents generation submitted successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to generate Delhivery LTL documents:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to generate Delhivery LTL documents',
        });
    }
};
exports.generateDelhiveryLtlDocumentsController = generateDelhiveryLtlDocumentsController;
const getDelhiveryLtlGeneratedDocumentStatusController = async (req, res) => {
    try {
        const docType = typeof req.params?.docType === 'string'
            ? req.params.docType.trim()
            : typeof req.query?.doc_type === 'string'
                ? req.query.doc_type.trim()
                : typeof req.query?.docType === 'string'
                    ? req.query.docType.trim()
                    : typeof req.body?.doc_type === 'string'
                        ? req.body.doc_type.trim()
                        : typeof req.body?.docType === 'string'
                            ? req.body.docType.trim()
                            : '';
        const jobId = typeof req.params?.jobId === 'string'
            ? req.params.jobId.trim()
            : typeof req.query?.job_id === 'string'
                ? req.query.job_id.trim()
                : typeof req.query?.jobId === 'string'
                    ? req.query.jobId.trim()
                    : typeof req.body?.job_id === 'string'
                        ? req.body.job_id.trim()
                        : typeof req.body?.jobId === 'string'
                            ? req.body.jobId.trim()
                            : '';
        const requestIdHeader = req.get('x-request-id');
        const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : typeof req.body?.request_id === 'string'
                ? req.body.request_id.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.getLtlGeneratedDocumentStatus(docType, jobId, requestId);
        res.json({
            success: true,
            message: 'Delhivery LTL document status fetched successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to fetch Delhivery LTL document status:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to fetch Delhivery LTL document status',
        });
    }
};
exports.getDelhiveryLtlGeneratedDocumentStatusController = getDelhiveryLtlGeneratedDocumentStatusController;
const bookDelhiveryLtlLastMileAppointmentController = async (req, res) => {
    try {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.bookLtlLastMileAppointment(req.body || {});
        res.json({
            success: true,
            message: 'Delhivery LTL last-mile appointment booked successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to book Delhivery LTL last-mile appointment:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to book Delhivery LTL last-mile appointment',
        });
    }
};
exports.bookDelhiveryLtlLastMileAppointmentController = bookDelhiveryLtlLastMileAppointmentController;
const createDelhiveryLtlPickupRequestController = async (req, res) => {
    try {
        const requestIdHeader = req.get('x-request-id');
        const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : typeof req.body?.request_id === 'string'
                ? req.body.request_id.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : undefined;
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.createLtlPickupRequest(req.body || {}, requestId);
        res.json({
            success: true,
            message: 'Delhivery LTL pickup request created successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to create Delhivery LTL pickup request:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to create Delhivery LTL pickup request',
        });
    }
};
exports.createDelhiveryLtlPickupRequestController = createDelhiveryLtlPickupRequestController;
const cancelDelhiveryLtlPickupRequestController = async (req, res) => {
    try {
        const pickupId = typeof req.params?.pickupId === 'string'
            ? req.params.pickupId.trim()
            : typeof req.body?.pickup_id === 'string'
                ? req.body.pickup_id.trim()
                : typeof req.body?.pickupId === 'string'
                    ? req.body.pickupId.trim()
                    : '';
        const requestIdHeader = req.get('x-request-id');
        const requestId = typeof requestIdHeader === 'string' && requestIdHeader.trim()
            ? requestIdHeader.trim()
            : typeof req.body?.request_id === 'string'
                ? req.body.request_id.trim()
                : typeof req.body?.requestId === 'string'
                    ? req.body.requestId.trim()
                    : '';
        const delhivery = new delhivery_service_1.DelhiveryService();
        const result = await delhivery.cancelLtlPickupRequest(pickupId, requestId);
        res.json({
            success: true,
            message: 'Delhivery LTL pickup request cancelled successfully',
            data: result,
        });
    }
    catch (err) {
        console.error('Failed to cancel Delhivery LTL pickup request:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(statusCode).json({
            success: false,
            message: err?.message || 'Failed to cancel Delhivery LTL pickup request',
        });
    }
};
exports.cancelDelhiveryLtlPickupRequestController = cancelDelhiveryLtlPickupRequestController;
const updateEkartCredentialsController = async (req, res) => {
    const { apiBase, clientId, username, password, webhookSecret } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextClientId = typeof clientId === 'string' ? clientId.trim() : undefined;
        const nextUsername = typeof username === 'string' ? username.trim() : undefined;
        const nextPassword = typeof password === 'string' ? password.trim() : undefined;
        const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0;
        const hasWebhookSecret = typeof webhookSecret === 'string' && webhookSecret.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://api.ekartlogistics.com';
            }
            if (nextClientId !== undefined) {
                updatePayload.clientId = nextClientId;
            }
            if (nextUsername !== undefined) {
                updatePayload.username = nextUsername;
            }
            if (hasPassword) {
                updatePayload.password = nextPassword;
            }
            if (hasWebhookSecret) {
                updatePayload.webhookSecret = webhookSecret;
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'ekart',
                apiBase: nextApiBase || 'https://api.ekartlogistics.com',
                clientName: '',
                apiKey: '',
                clientId: nextClientId || '',
                username: nextUsername || '',
                password: hasPassword ? nextPassword : '',
                webhookSecret: hasWebhookSecret ? webhookSecret : '',
            });
        }
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientId: courierCredentials_1.courier_credentials.clientId,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'))
            .limit(1);
        res.json({
            success: true,
            message: 'Ekart credentials updated successfully',
            data: {
                provider: 'ekart',
                apiBase: saved?.apiBase || 'https://api.ekartlogistics.com',
                clientId: saved?.clientId || '',
                username: saved?.username || '',
                hasPassword: Boolean((saved?.password || '').trim()),
                hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Ekart credentials' });
    }
};
exports.updateEkartCredentialsController = updateEkartCredentialsController;
const updateXpressbeesCredentialsController = async (req, res) => {
    const { apiBase, username, password, apiKey, webhookSecret, authBearer, secretKey, xbKey, xbAccessKey, businessUnit, businessFlow, businessService, businessServices, businessAccountName, pickupVendorCode, manifestServiceType, manifestPickupType, pincodeBusinessUnit, pincodeBusinessFlow, pickupBusinessService, deliveryBusinessService, serviceabilityVersion, trackingVersion, } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextUsername = typeof username === 'string' ? username.trim() : undefined;
        const nextPassword = typeof password === 'string' ? password.trim() : undefined;
        const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined;
        const nextWebhookSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined;
        const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0;
        const hasApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
        const hasWebhookSecret = typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0;
        const metadataInputs = {
            authBearer,
            secretKey,
            xbKey,
            xbAccessKey,
            businessUnit,
            businessFlow,
            businessService,
            businessServices,
            businessAccountName,
            pickupVendorCode,
            manifestServiceType,
            manifestPickupType,
            pincodeBusinessUnit,
            pincodeBusinessFlow,
            pickupBusinessService,
            deliveryBusinessService,
            serviceabilityVersion,
            trackingVersion,
        };
        const metadataUpdates = Object.entries(metadataInputs).reduce((acc, [key, value]) => {
            if (typeof value !== 'string')
                return acc;
            const normalized = value.trim();
            if (!normalized && ['authBearer', 'secretKey', 'xbKey', 'xbAccessKey'].includes(key)) {
                return acc;
            }
            acc[key] = normalized;
            return acc;
        }, {});
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id, metadata: courierCredentials_1.courier_credentials.metadata })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://shipment.xpressbees.com';
            }
            if (nextUsername !== undefined) {
                updatePayload.username = nextUsername;
            }
            if (hasPassword) {
                updatePayload.password = nextPassword;
            }
            if (hasApiKey) {
                updatePayload.apiKey = nextApiKey;
            }
            if (hasWebhookSecret) {
                updatePayload.webhookSecret = nextWebhookSecret;
            }
            if (Object.keys(metadataUpdates).length) {
                const existingMetadata = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
                updatePayload.metadata = {
                    ...existingMetadata,
                    ...metadataUpdates,
                };
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'xpressbees',
                apiBase: nextApiBase || 'https://shipment.xpressbees.com',
                clientName: '',
                apiKey: hasApiKey ? nextApiKey : '',
                clientId: '',
                username: nextUsername || '',
                password: hasPassword ? nextPassword : '',
                webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
                metadata: {
                    pincodeBusinessUnit: 'eComm',
                    pincodeBusinessFlow: 'Forward',
                    pickupBusinessService: 'PickUp',
                    deliveryBusinessService: 'Delivery',
                    serviceabilityVersion: 'v1',
                    trackingVersion: 'v1',
                    ...metadataUpdates,
                },
            });
        }
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
            metadata: courierCredentials_1.courier_credentials.metadata,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'))
            .limit(1);
        xpressbees_service_1.XpressbeesService.clearCachedConfig();
        res.json({
            success: true,
            message: 'Xpressbees credentials updated successfully',
            data: {
                provider: 'xpressbees',
                apiBase: saved?.apiBase || 'https://shipment.xpressbees.com',
                username: saved?.username || '',
                hasPassword: Boolean((saved?.password || '').trim()),
                hasApiKey: Boolean((saved?.apiKey || '').trim()),
                hasAuthBearer: Boolean(String(saved?.metadata?.authBearer ||
                    saved?.metadata?.auth_bearer ||
                    saved?.metadata?.authorizationBearer ||
                    '').trim()),
                hasSecretKey: Boolean(String(saved?.metadata?.secretKey || saved?.metadata?.secret_key || '').trim()),
                hasXbKey: Boolean(String(saved?.metadata?.xbKey || saved?.metadata?.xb_key || '').trim()),
                hasXbAccessKey: Boolean(String(saved?.metadata?.xbAccessKey ||
                    saved?.metadata?.xb_access_key ||
                    '').trim()),
                businessAccountName: String(saved?.metadata?.businessAccountName ||
                    saved?.metadata?.business_account_name ||
                    '').trim(),
                pickupVendorCode: String(saved?.metadata?.pickupVendorCode ||
                    saved?.metadata?.pickup_vendor_code ||
                    '').trim(),
                hasBusinessAccountName: Boolean(String(saved?.metadata?.businessAccountName ||
                    saved?.metadata?.business_account_name ||
                    '').trim()),
                hasPickupVendorCode: Boolean(String(saved?.metadata?.pickupVendorCode ||
                    saved?.metadata?.pickup_vendor_code ||
                    '').trim()),
                businessUnit: saved?.metadata?.businessUnit || 'ECOM',
                businessFlow: saved?.metadata?.businessFlow || 'FORWARD',
                businessService: saved?.metadata?.businessService || '',
                businessServices: saved?.metadata?.businessServices || 'SD,SDD,NDD,AIR,SFC,IntraSDD',
                manifestServiceType: saved?.metadata?.manifestServiceType || 'SD',
                manifestPickupType: saved?.metadata?.manifestPickupType || 'Vendor',
                hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
                pincodeBusinessUnit: saved?.metadata?.pincodeBusinessUnit || 'eComm',
                pincodeBusinessFlow: saved?.metadata?.pincodeBusinessFlow || 'Forward',
                pickupBusinessService: saved?.metadata?.pickupBusinessService || 'PickUp',
                deliveryBusinessService: saved?.metadata?.deliveryBusinessService || 'Delivery',
                serviceabilityVersion: saved?.metadata?.serviceabilityVersion || 'v1',
                trackingVersion: saved?.metadata?.trackingVersion || 'v1',
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Xpressbees credentials' });
    }
};
exports.updateXpressbeesCredentialsController = updateXpressbeesCredentialsController;
const updateShadowfaxCredentialsController = async (req, res) => {
    const { apiBase, clientName, apiKey, webhookSecret } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined;
        const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined;
        const nextWebhookSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined;
        const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
        const hasWebhookSecret = typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'shadowfax'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://dale.staging.shadowfax.in/api';
            }
            if (nextClientName !== undefined) {
                updatePayload.clientName = nextClientName;
            }
            if (hasNewApiKey) {
                updatePayload.apiKey = nextApiKey;
            }
            if (hasWebhookSecret) {
                updatePayload.webhookSecret = nextWebhookSecret;
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'shadowfax'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'shadowfax',
                apiBase: nextApiBase || 'https://dale.staging.shadowfax.in/api',
                clientName: nextClientName || '',
                apiKey: hasNewApiKey ? nextApiKey : '',
                webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
            });
        }
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientName: courierCredentials_1.courier_credentials.clientName,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'shadowfax'))
            .limit(1);
        shadowfax_service_1.ShadowfaxService.clearCachedConfig();
        res.json({
            success: true,
            message: 'Shadowfax credentials updated successfully',
            data: {
                provider: 'shadowfax',
                apiBase: saved?.apiBase || 'https://dale.staging.shadowfax.in/api',
                clientName: saved?.clientName || '',
                hasApiKey: Boolean((saved?.apiKey || '').trim()),
                hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Shadowfax credentials' });
    }
};
exports.updateShadowfaxCredentialsController = updateShadowfaxCredentialsController;
const updateAmazonCredentialsController = async (req, res) => {
    const { apiBase, endpoint, accessToken, refreshToken, lwaClientId, clientId, lwaClientSecret, clientSecret, shippingBusinessId, region, sandbox, lwaTokenUrl, tokenUrl, } = req.body || {};
    try {
        const [existing] = await client_1.db
            .select()
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, amazonShippingCredentials_service_1.AMAZON_CREDENTIALS_PROVIDER))
            .limit(1);
        const nextCredentials = { ...(0, amazonShippingCredentials_service_1.buildAmazonShippingCredentialsFromRow)(existing) };
        const nextEndpoint = optionalCredentialString(endpoint) ?? optionalCredentialString(apiBase);
        const nextAccessToken = optionalCredentialString(accessToken);
        const nextRefreshToken = optionalCredentialString(refreshToken);
        const nextLwaClientId = optionalCredentialString(lwaClientId) ?? optionalCredentialString(clientId);
        const nextLwaClientSecret = optionalCredentialString(lwaClientSecret) ?? optionalCredentialString(clientSecret);
        const nextShippingBusinessId = optionalCredentialString(shippingBusinessId);
        const nextRegion = optionalCredentialString(region);
        const nextLwaTokenUrl = optionalCredentialString(lwaTokenUrl) ?? optionalCredentialString(tokenUrl);
        if (nextEndpoint !== undefined) {
            nextCredentials.endpoint = nextEndpoint;
        }
        if (nextAccessToken) {
            nextCredentials.accessToken = nextAccessToken;
        }
        if (nextRefreshToken) {
            nextCredentials.refreshToken = nextRefreshToken;
        }
        if (nextLwaClientId !== undefined) {
            nextCredentials.lwaClientId = nextLwaClientId;
        }
        if (nextLwaClientSecret) {
            nextCredentials.lwaClientSecret = nextLwaClientSecret;
        }
        if (nextShippingBusinessId !== undefined) {
            nextCredentials.shippingBusinessId = nextShippingBusinessId || amazonShippingCredentials_service_1.AMAZON_DEFAULT_BUSINESS_ID;
        }
        if (nextRegion !== undefined) {
            nextCredentials.region = nextRegion || amazonShippingCredentials_service_1.AMAZON_DEFAULT_REGION;
        }
        if (sandbox !== undefined) {
            nextCredentials.sandbox = (0, amazonShippingCredentials_service_1.parseAmazonSandboxFlag)(sandbox);
        }
        if (nextLwaTokenUrl !== undefined) {
            nextCredentials.lwaTokenUrl = nextLwaTokenUrl;
        }
        const normalizedTokens = (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialTokens)({
            accessToken: nextCredentials.accessToken,
            refreshToken: nextCredentials.refreshToken,
        });
        nextCredentials.accessToken = normalizedTokens.accessToken;
        nextCredentials.refreshToken = normalizedTokens.refreshToken;
        const metadata = {
            accessToken: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.accessToken),
            refreshToken: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.refreshToken),
            lwaClientId: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.lwaClientId),
            lwaClientSecret: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.lwaClientSecret),
            endpoint: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.endpoint),
            region: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.region) || amazonShippingCredentials_service_1.AMAZON_DEFAULT_REGION,
            sandbox: Boolean(nextCredentials.sandbox),
            shippingBusinessId: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.shippingBusinessId) ||
                amazonShippingCredentials_service_1.AMAZON_DEFAULT_BUSINESS_ID,
            lwaTokenUrl: (0, amazonShippingCredentials_service_1.normalizeAmazonCredentialValue)(nextCredentials.lwaTokenUrl),
        };
        const values = {
            provider: amazonShippingCredentials_service_1.AMAZON_CREDENTIALS_PROVIDER,
            apiBase: metadata.endpoint,
            clientName: metadata.shippingBusinessId,
            apiKey: metadata.refreshToken || metadata.accessToken,
            clientId: metadata.lwaClientId,
            username: metadata.region,
            password: metadata.lwaClientSecret,
            webhookSecret: String(metadata.sandbox),
            metadata,
            updatedAt: new Date(),
        };
        await client_1.db
            .insert(courierCredentials_1.courier_credentials)
            .values(values)
            .onConflictDoUpdate({
            target: courierCredentials_1.courier_credentials.provider,
            set: values,
        });
        (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)(nextCredentials, { overwriteExisting: true });
        const [saved] = await client_1.db
            .select()
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, amazonShippingCredentials_service_1.AMAZON_CREDENTIALS_PROVIDER))
            .limit(1);
        res.json({
            success: true,
            message: 'Amazon credentials updated successfully',
            data: buildAmazonCredentialResponse(saved),
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Amazon credentials' });
    }
};
exports.updateAmazonCredentialsController = updateAmazonCredentialsController;
// Utility: convert numbers to string for decimal fields
const numericToString = (val) => {
    if (val === null || val === undefined || val === '')
        return null;
    return String(val);
};
exports.numericToString = numericToString;
// ---------------- Controller ----------------
const updateShippingRateController = async (req, res) => {
    try {
        const courierId = Number(req.params.id); // courier_id from params
        let planId = req.params.planId; // plan_id from params
        // Fallback: try to get planId from query or body if not in params
        if (!planId || planId === 'undefined') {
            planId = req.query.planId || req.body.planId || undefined;
        }
        if (!courierId || isNaN(courierId)) {
            return res.status(400).json({ success: false, message: 'Invalid courier ID' });
        }
        if (!planId || planId === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing plan ID. Please ensure a plan is selected.',
            });
        }
        const updates = req.body;
        console.log(`[updateShippingRateController] courierId: ${courierId}, planId: ${planId}`);
        const updated = await (0, courierIntegration_service_1.updateShippingRate)(courierId, updates, planId);
        if (!updated)
            return res.status(404).json({ success: false, message: 'Rate card not found' });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        console.log('Error updating shipping rate:', err);
        const statusCode = (0, rateCardImport_service_1.isSlabValidationError)(err) ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: (0, rateCardImport_service_1.isSlabValidationError)(err)
                ? String(err?.message || 'Invalid slab configuration')
                : 'Internal Server Error',
        });
    }
};
exports.updateShippingRateController = updateShippingRateController;
const isExcelRateCard = (file) => {
    const name = String(file?.originalname || '').toLowerCase();
    const mime = String(file?.mimetype || '').toLowerCase();
    return (name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        mime.includes('spreadsheet') ||
        mime.includes('excel'));
};
const parseRateCardFile = (file) => {
    if (isExcelRateCard(file)) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            return { data: [], errors: [{ message: 'Excel file has no sheets' }] };
        }
        const worksheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: '',
            raw: false,
            blankrows: false,
        });
        return { data: rows.map(rateCardImport_service_1.normalizeRateCardRow), errors: [] };
    }
    return (0, rateCardImport_service_1.parseRateCardCsvText)(file.buffer.toString('utf8'));
};
const importShippingRatesController = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const { planId: plan_id, businessType: business_type } = req.query;
        if (!plan_id || !business_type) {
            return res.status(400).json({ success: false, message: 'Missing plan_id or business_type' });
        }
        const normalizedBusinessType = String(business_type).toLowerCase();
        if (normalizedBusinessType !== 'b2b' && normalizedBusinessType !== 'b2c') {
            return res.status(400).json({ success: false, message: 'Invalid business_type' });
        }
        const importScope = String(req.query.importScope || 'single').trim().toLowerCase();
        const isB2CAllCourierImport = normalizedBusinessType === 'b2c' && importScope === 'all';
        const b2cCourierScope = isB2CAllCourierImport ? {} : {
            courierId: req.query.courierId ? String(req.query.courierId).trim() : '',
            courierName: req.query.courierName ? String(req.query.courierName).trim() : '',
            serviceProvider: req.query.serviceProvider ? String(req.query.serviceProvider).trim() : '',
        };
        if (normalizedBusinessType === 'b2c' && !isB2CAllCourierImport && !b2cCourierScope.courierId) {
            return res.status(400).json({
                success: false,
                message: 'Select one courier or choose all-courier import before importing a B2C rate card.',
            });
        }
        if (normalizedBusinessType === 'b2c' &&
            b2cCourierScope.serviceProvider &&
            !['delhivery', 'manual', 'velocity'].includes(b2cCourierScope.serviceProvider.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: 'B2C rate-card import is allowed only for Delhivery, Velocity, and manual couriers.',
            });
        }
        const { data, errors } = parseRateCardFile(req.file);
        if (errors.length) {
            console.error('Rate card parse errors:', errors);
            return res.status(400).json({ success: false, message: 'Invalid rate card file', errors });
        }
        const zonesList = await (0, zone_service_1.getAllZones)(normalizedBusinessType);
        // Detect format: new slab-per-row format has a "Slab Type" column
        const headers = data.length ? Object.keys(data[0]) : [];
        const isSlabFormat = headers.some((h) => h.trim() === 'Slab Type');
        let savedRows = 0;
        if (normalizedBusinessType === 'b2c' && isSlabFormat) {
            savedRows = await (0, rateCardImport_service_1.importB2CSlabFormat)(data, plan_id, zonesList, b2cCourierScope);
        }
        else {
            savedRows = await (0, rateCardImport_service_1.importFlatFormat)(data, plan_id, normalizedBusinessType, zonesList);
        }
        if (savedRows === 0) {
            return res.status(400).json({
                success: false,
                message: 'No rate rows were imported. Check the plan, courier, mode, zone column names, and rate values in the file.',
            });
        }
        res.json({
            success: true,
            message: `Shipping rates imported successfully. ${savedRows} rate rows saved.`,
            data: { savedRows },
        });
    }
    catch (err) {
        console.error('Error importing shipping rates:', err);
        const statusCode = (0, rateCardImport_service_1.isSlabValidationError)(err) ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: (0, rateCardImport_service_1.isSlabValidationError)(err)
                ? String(err?.message || 'Invalid slab configuration')
                : 'Internal Server Error',
        });
    }
};
exports.importShippingRatesController = importShippingRatesController;
const deleteShippingRateController = async (req, res) => {
    try {
        const courierId = Number(req.params.id);
        const planId = req.params.planId;
        const businessType = req.query.businessType;
        const zoneId = req.query.zoneId;
        const serviceProvider = req.query.serviceProvider;
        const mode = req.query.mode;
        if (!courierId || !planId || !businessType) {
            return res
                .status(400)
                .json({ success: false, message: 'courierId, planId and businessType are required' });
        }
        const deleted = await (0, courierIntegration_service_1.deleteShippingRate)(courierId, planId, businessType, zoneId, serviceProvider, mode);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'No matching rate found' });
        }
        res.json({ success: true, message: 'Rate(s) deleted successfully', data: deleted });
    }
    catch (err) {
        console.error('Error deleting shipping rate:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.deleteShippingRateController = deleteShippingRateController;
const deleteCourierController = async (req, res) => {
    const { id } = req.params;
    const { serviceProvider } = req.body;
    try {
        if (!serviceProvider) {
            return res.status(400).json({ success: false, message: 'Service provider is required' });
        }
        await (0, courierIntegration_service_1.deleteCourierService)(id, serviceProvider);
        res.json({ success: true, message: 'Courier deleted successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to delete courier' });
    }
};
exports.deleteCourierController = deleteCourierController;
