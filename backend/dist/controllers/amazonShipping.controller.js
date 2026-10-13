"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAmazonAdditionalInputsController = exports.submitAmazonNdrFeedbackController = exports.getAmazonAccessPointsController = exports.cancelAmazonShipmentController = exports.getAmazonShipmentDocumentsController = exports.getAmazonShippingTrackingController = exports.oneClickAmazonShipmentController = exports.purchaseAmazonShipmentController = exports.getAmazonShippingRatesController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const amazonShipping_service_1 = require("../models/services/amazonShipping.service");
const amazonShippingCredentials_service_1 = require("../models/services/amazonShippingCredentials.service");
const client_1 = require("../models/client");
const pickupAddresses_1 = require("../models/schema/pickupAddresses");
const classes_1 = require("../utils/classes");
const INTERNAL_BODY_KEYS = new Set([
    'credentials',
    'amazonCredentials',
    'accessToken',
    'refreshToken',
    'lwaClientId',
    'lwaClientSecret',
    'clientId',
    'clientSecret',
    'endpoint',
    'region',
    'sandbox',
    'shippingBusinessId',
    'idempotencyKey',
    'lwaTokenUrl',
    'tokenUrl',
    'body',
    'request',
    'pickupId',
    'pickup_id',
    'warehouseId',
    'warehouse_id',
]);
const normalize = (value) => String(value ?? '').trim();
const truthy = (value) => {
    if (typeof value === 'boolean')
        return value;
    return ['1', 'true', 'yes', 'sandbox'].includes(normalize(value).toLowerCase());
};
const optionalTruth = (value) => (value === undefined ? undefined : truthy(value));
const readCredentials = (req) => {
    const bodyCredentials = req.body?.credentials || req.body?.amazonCredentials || {};
    const accessToken = normalize(req.headers?.['x-amz-access-token'] || bodyCredentials.accessToken || req.body?.accessToken);
    return {
        accessToken,
        refreshToken: normalize(bodyCredentials.refreshToken || req.body?.refreshToken),
        lwaClientId: normalize(bodyCredentials.lwaClientId || bodyCredentials.clientId || req.body?.lwaClientId || req.body?.clientId),
        lwaClientSecret: normalize(bodyCredentials.lwaClientSecret ||
            bodyCredentials.clientSecret ||
            req.body?.lwaClientSecret ||
            req.body?.clientSecret),
        endpoint: normalize(bodyCredentials.endpoint || req.body?.endpoint),
        region: normalize(bodyCredentials.region || req.body?.region),
        sandbox: bodyCredentials.sandbox !== undefined
            ? optionalTruth(bodyCredentials.sandbox)
            : optionalTruth(req.body?.sandbox),
        shippingBusinessId: normalize(req.headers?.['x-amzn-shipping-business-id'] ||
            bodyCredentials.shippingBusinessId ||
            req.body?.shippingBusinessId),
        idempotencyKey: normalize(req.headers?.['x-amzn-idempotencykey'] ||
            req.headers?.['x-amzn-idempotency-key'] ||
            bodyCredentials.idempotencyKey ||
            req.body?.idempotencyKey),
        lwaTokenUrl: normalize(bodyCredentials.lwaTokenUrl ||
            bodyCredentials.tokenUrl ||
            req.body?.lwaTokenUrl ||
            req.body?.tokenUrl),
        useDirectAccessToken: Boolean(accessToken),
    };
};
const mergeCredentials = (storedCredentials, requestCredentials) => {
    const merged = { ...storedCredentials };
    const secretKeys = [
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
    secretKeys.forEach((key) => {
        const value = normalize(requestCredentials[key]);
        if (value) {
            ;
            merged[key] = value;
        }
    });
    if (requestCredentials.sandbox !== undefined) {
        merged.sandbox = requestCredentials.sandbox;
    }
    if (requestCredentials.useDirectAccessToken !== undefined) {
        merged.useDirectAccessToken = requestCredentials.useDirectAccessToken;
    }
    return merged;
};
const getEffectiveAmazonCredentials = async (req) => {
    const storedCredentials = await (0, amazonShippingCredentials_service_1.getStoredAmazonShippingCredentials)();
    (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)(storedCredentials);
    return mergeCredentials(storedCredentials, readCredentials(req));
};
const stripInternalBodyKeys = (body) => {
    const cleanBody = {};
    Object.entries(body || {}).forEach(([key, value]) => {
        if (!INTERNAL_BODY_KEYS.has(key))
            cleanBody[key] = value;
    });
    return cleanBody;
};
const readAmazonBody = (req) => {
    if (req.body?.body && typeof req.body.body === 'object') {
        return stripInternalBodyKeys(req.body.body);
    }
    if (req.body?.request && typeof req.body.request === 'object') {
        return stripInternalBodyKeys(req.body.request);
    }
    return stripInternalBodyKeys(req.body || {});
};
const readPickupWarehouseId = (req) => {
    const body = req.body || {};
    const nestedBody = body.body && typeof body.body === 'object'
        ? body.body
        : body.request && typeof body.request === 'object'
            ? body.request
            : {};
    return normalize(body.pickupId ||
        body.pickup_id ||
        body.warehouseId ||
        body.warehouse_id ||
        nestedBody.pickupId ||
        nestedBody.pickup_id ||
        nestedBody.warehouseId ||
        nestedBody.warehouse_id);
};
const getRequestUserId = (req) => normalize(req.user?.sub || req.userId || req.user?.id || req.auth?.sub);
const getAmazonShipFromForPickup = async (req) => {
    const pickupId = readPickupWarehouseId(req);
    if (!pickupId)
        return null;
    const userId = getRequestUserId(req);
    if (!userId)
        throw new classes_1.HttpError(401, 'User is required to use a saved Amazon warehouse');
    const [warehouse] = await client_1.db
        .select({
        pickupId: pickupAddresses_1.pickupAddresses.id,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        contactEmail: pickupAddresses_1.addresses.contactEmail,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        landmark: pickupAddresses_1.addresses.landmark,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        country: pickupAddresses_1.addresses.country,
        pincode: pickupAddresses_1.addresses.pincode,
        latitude: pickupAddresses_1.addresses.latitude,
        longitude: pickupAddresses_1.addresses.longitude,
    })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.id, pickupId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true)))
        .limit(1);
    if (!warehouse)
        throw new classes_1.HttpError(404, 'Amazon Shipping pickup warehouse not found or inactive');
    return (0, amazonShipping_service_1.buildAmazonShippingAddressFromWarehouse)({
        alias: warehouse.addressNickname || warehouse.contactName || 'Amazon Warehouse',
        contactName: warehouse.contactName,
        contactPhone: warehouse.contactPhone,
        contactEmail: warehouse.contactEmail,
        addressLine1: warehouse.addressLine1,
        addressLine2: warehouse.addressLine2,
        landmark: warehouse.landmark,
        city: warehouse.city,
        state: warehouse.state,
        country: warehouse.country,
        pincode: warehouse.pincode,
        latitude: warehouse.latitude,
        longitude: warehouse.longitude,
        companyName: warehouse.addressNickname || warehouse.contactName || 'Shipray',
    });
};
const readAmazonBodyWithWarehouse = async (req) => {
    const body = readAmazonBody(req);
    if (body.shipFrom)
        return body;
    const shipFrom = await getAmazonShipFromForPickup(req);
    return shipFrom ? { ...body, shipFrom } : body;
};
const sendProviderError = (res, error, fallback) => res.status(error?.statusCode || 500).json({
    success: false,
    error: fallback,
    message: error?.message || fallback,
    amazon: error?.details
        ? {
            requestId: error.details.requestId || null,
            rateLimit: error.details.rateLimit || null,
            errors: error.details.errors || undefined,
        }
        : undefined,
});
const getAmazonShippingRatesController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.getAmazonShippingRates)(await readAmazonBodyWithWarehouse(req), await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon Shipping rates fetched successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] getRates failed:', error);
        return sendProviderError(res, error, 'Failed to fetch Amazon Shipping rates');
    }
};
exports.getAmazonShippingRatesController = getAmazonShippingRatesController;
const purchaseAmazonShipmentController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.purchaseAmazonShipment)(readAmazonBody(req), await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon shipment purchased successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] purchaseShipment failed:', error);
        return sendProviderError(res, error, 'Failed to purchase Amazon shipment');
    }
};
exports.purchaseAmazonShipmentController = purchaseAmazonShipmentController;
const oneClickAmazonShipmentController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.oneClickAmazonShipment)(await readAmazonBodyWithWarehouse(req), await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon one-click shipment purchased successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] oneClickShipment failed:', error);
        return sendProviderError(res, error, 'Failed to purchase Amazon one-click shipment');
    }
};
exports.oneClickAmazonShipmentController = oneClickAmazonShipmentController;
const getAmazonShippingTrackingController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.getAmazonShippingTracking)({
            trackingId: normalize(req.query?.trackingId || req.body?.trackingId),
            carrierId: normalize(req.query?.carrierId || req.body?.carrierId),
        }, await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon Shipping tracking fetched successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] getTracking failed:', error);
        return sendProviderError(res, error, 'Failed to fetch Amazon Shipping tracking');
    }
};
exports.getAmazonShippingTrackingController = getAmazonShippingTrackingController;
const getAmazonShipmentDocumentsController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.getAmazonShipmentDocuments)({
            shipmentId: normalize(req.params?.shipmentId || req.query?.shipmentId || req.body?.shipmentId),
            packageClientReferenceId: normalize(req.query?.packageClientReferenceId || req.body?.packageClientReferenceId),
            format: normalize(req.query?.format || req.body?.format),
            dpi: req.query?.dpi || req.body?.dpi,
        }, await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon shipment documents fetched successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] getShipmentDocuments failed:', error);
        return sendProviderError(res, error, 'Failed to fetch Amazon shipment documents');
    }
};
exports.getAmazonShipmentDocumentsController = getAmazonShipmentDocumentsController;
const cancelAmazonShipmentController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.cancelAmazonShipment)({
            shipmentId: normalize(req.params?.shipmentId || req.query?.shipmentId || req.body?.shipmentId),
        }, await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon shipment cancelled successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] cancelShipment failed:', error);
        return sendProviderError(res, error, 'Failed to cancel Amazon shipment');
    }
};
exports.cancelAmazonShipmentController = cancelAmazonShipmentController;
const getAmazonAccessPointsController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.getAmazonAccessPoints)({
            accessPointTypes: req.query?.accessPointTypes || req.body?.accessPointTypes,
            countryCode: normalize(req.query?.countryCode || req.body?.countryCode),
            postalCode: normalize(req.query?.postalCode || req.body?.postalCode),
        }, await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon access points fetched successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] getAccessPoints failed:', error);
        return sendProviderError(res, error, 'Failed to fetch Amazon access points');
    }
};
exports.getAmazonAccessPointsController = getAmazonAccessPointsController;
const submitAmazonNdrFeedbackController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.submitAmazonNdrFeedback)(readAmazonBody(req), await getEffectiveAmazonCredentials(req));
        res.setHeader('X-Amzn-RequestId', result.amazon.requestId || '');
        if (result.amazon.rateLimit)
            res.setHeader('X-Amzn-RateLimit-Limit', result.amazon.rateLimit);
        return res.status(204).send();
    }
    catch (error) {
        console.error('[AmazonShipping] submitNdrFeedback failed:', error);
        return sendProviderError(res, error, 'Failed to submit Amazon NDR feedback');
    }
};
exports.submitAmazonNdrFeedbackController = submitAmazonNdrFeedbackController;
const getAmazonAdditionalInputsController = async (req, res) => {
    try {
        const result = await (0, amazonShipping_service_1.getAmazonAdditionalInputs)({
            requestToken: normalize(req.query?.requestToken || req.body?.requestToken),
            rateId: normalize(req.query?.rateId || req.body?.rateId),
        }, await getEffectiveAmazonCredentials(req));
        return res.status(200).json({
            success: true,
            message: 'Amazon additional inputs schema fetched successfully',
            amazon: result.amazon,
            data: result.data,
        });
    }
    catch (error) {
        console.error('[AmazonShipping] getAdditionalInputs failed:', error);
        return sendProviderError(res, error, 'Failed to fetch Amazon additional inputs schema');
    }
};
exports.getAmazonAdditionalInputsController = getAmazonAdditionalInputsController;
