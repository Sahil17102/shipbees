"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAmazonAdditionalInputs = exports.submitAmazonNdrFeedback = exports.getAmazonAccessPoints = exports.cancelAmazonShipment = exports.getAmazonShipmentDocuments = exports.getAmazonShippingTracking = exports.oneClickAmazonShipment = exports.purchaseAmazonShipment = exports.getAmazonShippingRates = exports.getAmazonShippingAccessToken = exports.createAmazonShippingWarehouse = exports.buildAmazonShippingAddressFromWarehouse = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const classes_1 = require("../../utils/classes");
const DEFAULT_AMAZON_LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_TIMEOUT_MS = Number(process.env.AMAZON_SHIPPING_TIMEOUT_MS || 30000);
const DEFAULT_USER_AGENT = 'Shipray/1.0 (Language=Node.js)';
const VALID_BUSINESS_IDS = new Set([
    'AmazonShipping_US',
    'AmazonShipping_IN',
    'AmazonShipping_UK',
    'AmazonShipping_UAE',
    'AmazonShipping_SA',
    'AmazonShipping_EG',
    'AmazonShipping_IT',
    'AmazonShipping_ES',
    'AmazonShipping_FR',
    'AmazonShipping_JP',
]);
const VALID_ACCESS_POINT_TYPES = new Set([
    'HELIX',
    'CAMPUS_LOCKER',
    'OMNI_LOCKER',
    'ODIN_LOCKER',
    'DOBBY_LOCKER',
    'CORE_LOCKER',
    '3P',
    'CAMPUS_ROOM',
]);
const VALID_NDR_ACTIONS = new Set(['RESCHEDULE', 'REATTEMPT', 'RTO']);
const normalize = (value) => String(value ?? '').trim();
const normalizeAmazonGstNumber = (value) => {
    const normalized = normalize(value).toUpperCase().replace(/\s+/g, '');
    return /^[0-9A-Z]{15}$/.test(normalized) ? normalized : '';
};
const normalizeCsvValues = (value) => {
    const rawValues = Array.isArray(value) ? value : normalize(value).split(',');
    return rawValues.map((item) => normalize(item)).filter(Boolean);
};
const boolFrom = (value) => {
    if (typeof value === 'boolean')
        return value;
    const normalized = normalize(value).toLowerCase();
    return ['1', 'true', 'yes', 'y', 'sandbox'].includes(normalized);
};
const AMAZON_ADDRESS_MAX = {
    name: 50,
    line: 60,
    email: 64,
    phone: 20,
};
const COUNTRY_CODE_ALIASES = {
    india: 'IN',
    bharat: 'IN',
    in: 'IN',
    usa: 'US',
    us: 'US',
    'united states': 'US',
    'united states of america': 'US',
    uk: 'GB',
    gb: 'GB',
    'united kingdom': 'GB',
};
const truncateAmazonField = (value, maxLength) => {
    const normalized = normalize(value);
    return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
};
const normalizeAmazonCountryCode = (value) => {
    const normalized = normalize(value);
    if (!normalized)
        return 'IN';
    const lower = normalized.toLowerCase();
    if (COUNTRY_CODE_ALIASES[lower])
        return COUNTRY_CODE_ALIASES[lower];
    if (/^[a-z]{2}$/i.test(normalized))
        return normalized.toUpperCase();
    return 'IN';
};
const normalizeAmazonPhoneNumber = (value, countryCode) => {
    const digits = normalize(value).replace(/\D/g, '');
    if (!digits)
        return undefined;
    const localDigits = countryCode === 'IN' && digits.length > 10 && digits.startsWith('91')
        ? digits.slice(-10)
        : digits;
    const withDialCode = countryCode === 'IN' && localDigits.length === 10 ? `91${localDigits}` : localDigits;
    return truncateAmazonField(`+${withDialCode}`, AMAZON_ADDRESS_MAX.phone);
};
const normalizeAmazonGeocode = (latitude, longitude) => {
    const lat = Number(normalize(latitude));
    const lon = Number(normalize(longitude));
    if (!Number.isFinite(lat) || !Number.isFinite(lon))
        return undefined;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180)
        return undefined;
    return {
        latitude: String(lat),
        longitude: String(lon),
    };
};
const splitAmazonAddressLines = (...values) => {
    const combined = values
        .map((value) => normalize(value))
        .filter(Boolean)
        .join(', ');
    const lines = [];
    let remaining = combined;
    while (remaining && lines.length < 3) {
        if (remaining.length <= AMAZON_ADDRESS_MAX.line) {
            lines.push(remaining);
            break;
        }
        const candidate = remaining.slice(0, AMAZON_ADDRESS_MAX.line);
        const lastBreak = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf(','));
        const splitAt = lastBreak > 20 ? lastBreak + 1 : AMAZON_ADDRESS_MAX.line;
        lines.push(remaining.slice(0, splitAt).trim().replace(/,$/, ''));
        remaining = remaining.slice(splitAt).trim();
    }
    return {
        addressLine1: lines[0] || '',
        addressLine2: lines[1],
        addressLine3: lines[2],
    };
};
const requireAmazonAddressField = (field, value) => {
    if (!value)
        throw new classes_1.HttpError(400, `Amazon Shipping warehouse ${field} is required`);
    return value;
};
const buildAmazonShippingAddressFromWarehouse = (warehouse) => {
    const countryCode = normalizeAmazonCountryCode(warehouse.country);
    const addressLines = splitAmazonAddressLines(warehouse.addressLine1, warehouse.addressLine2, warehouse.landmark);
    const geocode = normalizeAmazonGeocode(warehouse.latitude, warehouse.longitude);
    const email = truncateAmazonField(warehouse.contactEmail, AMAZON_ADDRESS_MAX.email);
    const phoneNumber = normalizeAmazonPhoneNumber(warehouse.contactPhone, countryCode);
    return {
        name: requireAmazonAddressField('name', truncateAmazonField(warehouse.alias || warehouse.contactName || warehouse.companyName, AMAZON_ADDRESS_MAX.name)),
        addressLine1: requireAmazonAddressField('addressLine1', addressLines.addressLine1),
        ...(addressLines.addressLine2 ? { addressLine2: addressLines.addressLine2 } : {}),
        ...(addressLines.addressLine3 ? { addressLine3: addressLines.addressLine3 } : {}),
        ...(warehouse.companyName
            ? { companyName: truncateAmazonField(warehouse.companyName, AMAZON_ADDRESS_MAX.name) }
            : {}),
        stateOrRegion: requireAmazonAddressField('stateOrRegion', truncateAmazonField(warehouse.state, AMAZON_ADDRESS_MAX.line)),
        city: requireAmazonAddressField('city', truncateAmazonField(warehouse.city, AMAZON_ADDRESS_MAX.line)),
        countryCode,
        postalCode: requireAmazonAddressField('postalCode', truncateAmazonField(warehouse.pincode, AMAZON_ADDRESS_MAX.line)),
        ...(email ? { email } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(geocode ? { geocode } : {}),
    };
};
exports.buildAmazonShippingAddressFromWarehouse = buildAmazonShippingAddressFromWarehouse;
const createAmazonShippingWarehouse = (warehouse) => {
    const alias = normalize(warehouse.alias || warehouse.contactName || 'Amazon Warehouse');
    return {
        provider: 'amazon',
        alias,
        shipFrom: (0, exports.buildAmazonShippingAddressFromWarehouse)({
            ...warehouse,
            alias,
        }),
        returnAddress: warehouse.returnAddress
            ? (0, exports.buildAmazonShippingAddressFromWarehouse)({
                ...warehouse.returnAddress,
                alias: warehouse.returnAddress.alias || `${alias} Return`,
            })
            : undefined,
    };
};
exports.createAmazonShippingWarehouse = createAmazonShippingWarehouse;
const redact = (value) => {
    const normalized = normalize(value);
    if (!normalized)
        return '';
    if (normalized.length <= 8)
        return '********';
    return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
};
const fingerprint = (value) => {
    const normalized = normalize(value);
    if (!normalized)
        return '';
    return (0, crypto_1.createHash)('sha256').update(normalized).digest('hex').slice(0, 12);
};
const providerMessage = (error, fallback) => {
    const data = error?.response?.data;
    if (typeof data === 'string' && data.trim())
        return data.trim();
    if (Array.isArray(data?.errors)) {
        const messages = data.errors
            .map((entry) => [entry?.code, entry?.message, entry?.details].filter(Boolean).join(': '))
            .filter(Boolean);
        if (messages.length)
            return messages.join(', ');
    }
    return normalize(data?.message || data?.error_description || data?.error || error?.message) || fallback;
};
const summarizeAmazonRequestData = (path, data) => {
    if (!data || typeof data !== 'object')
        return undefined;
    if (path === '/shipping/v2/shipments/rates' || path === '/shipping/v2/oneClickShipment') {
        return {
            shipmentType: normalize(data.shipmentType) || null,
            packageCount: Array.isArray(data.packages) ? data.packages.length : 0,
            shipFrom: {
                postalCode: normalize(data.shipFrom?.postalCode) || null,
                countryCode: normalize(data.shipFrom?.countryCode) || null,
            },
            shipTo: {
                postalCode: normalize(data.shipTo?.postalCode) || null,
                countryCode: normalize(data.shipTo?.countryCode) || null,
            },
            hasTaxDetails: Array.isArray(data.taxDetails) && data.taxDetails.length > 0,
            hasCollectOnDelivery: Boolean(data.valueAddedServices?.collectOnDelivery) ||
                Boolean(data.value_added_services?.collect_on_delivery),
        };
    }
    if (path === '/shipping/v2/shipments') {
        const documentSpecification = data.requestedDocumentSpecification || {};
        return {
            hasRequestToken: Boolean(normalize(data.requestToken)),
            hasRateId: Boolean(normalize(data.rateId)),
            requestedDocumentSpecification: {
                format: normalize(documentSpecification.format) || null,
                dpi: documentSpecification.dpi ?? null,
                pageLayout: normalize(documentSpecification.pageLayout) || null,
                size: documentSpecification.size || null,
                requestedDocumentTypes: documentSpecification.requestedDocumentTypes || [],
            },
            requestedValueAddedServices: Array.isArray(data.requestedValueAddedServices)
                ? data.requestedValueAddedServices.map((service) => normalize(service?.id)).filter(Boolean)
                : [],
        };
    }
    return undefined;
};
const isInvalidAmazonRefreshTokenError = (error, message) => {
    const status = Number(error?.response?.status);
    const data = error?.response?.data;
    const text = [
        message,
        typeof data === 'string' ? data : '',
        data?.message,
        data?.error_description,
        data?.error,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    const mentionsInvalidGrant = text.includes('invalid_grant') || text.includes('invalid grant');
    const mentionsRefreshToken = text.includes('refresh_token') || text.includes('refresh token');
    const mentionsRevokedGrant = text.includes('refresh_token') && (text.includes('revoked') || text.includes("didn't grant"));
    return status === 400 && ((mentionsInvalidGrant && mentionsRefreshToken) || mentionsRevokedGrant);
};
const providerErrors = (error) => {
    const errors = error?.response?.data?.errors;
    return Array.isArray(errors) ? errors : undefined;
};
const isAmazonProviderInternalInputError = (errors) => Array.isArray(errors) &&
    errors.some((entry) => {
        const text = [entry?.code, entry?.message, entry?.details]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return text.includes('s-900') || text.includes('internal service error');
    });
const isRetryableAmazonRatesError = (error) => error?.details?.providerInternalInputError === true ||
    isAmazonProviderInternalInputError(error?.details?.errors);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const addCourierAliasesToRate = (rate) => {
    if (!rate || typeof rate !== 'object' || Array.isArray(rate))
        return rate;
    const courierId = normalize(rate.courier_id ?? rate.courierId ?? rate.carrierId ?? rate.serviceId ?? rate.rateId);
    const courierName = normalize(rate.courier_name ?? rate.courierName ?? rate.carrierName ?? rate.serviceName);
    return {
        ...rate,
        courier_id: courierId || null,
        courier_name: courierName || 'Amazon Shipping',
        courierId: courierId || null,
        courierName: courierName || 'Amazon Shipping',
    };
};
const addCourierAliasesToRatesResponse = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return data;
    const response = data;
    const payload = response.payload && typeof response.payload === 'object' ? response.payload : null;
    if (Array.isArray(response.rates)) {
        return {
            ...response,
            rates: response.rates.map(addCourierAliasesToRate),
        };
    }
    if (payload && Array.isArray(payload.rates)) {
        return {
            ...response,
            payload: {
                ...payload,
                rates: payload.rates.map(addCourierAliasesToRate),
            },
        };
    }
    return data;
};
const resolveLwaTokenUrl = (credentials) => {
    const explicit = normalize(credentials.lwaTokenUrl ||
        process.env.AMAZON_SHIPPING_LWA_TOKEN_URL ||
        process.env.AMAZON_LWA_TOKEN_URL).replace(/\/+$/, '');
    if (explicit)
        return explicit;
    const businessId = normalize(credentials.shippingBusinessId || process.env.AMAZON_SHIPPING_BUSINESS_ID);
    const byBusinessId = {
        AmazonShipping_UK: 'https://api.amazon.co.uk/auth/o2/token',
        AmazonShipping_FR: 'https://api.amazon.fr/auth/o2/token',
        AmazonShipping_IT: 'https://api.amazon.it/auth/o2/token',
        AmazonShipping_ES: 'https://api.amazon.es/auth/o2/token',
        AmazonShipping_US: DEFAULT_AMAZON_LWA_TOKEN_URL,
    };
    return byBusinessId[businessId] || DEFAULT_AMAZON_LWA_TOKEN_URL;
};
const resolveEndpoint = (credentials) => {
    const explicit = normalize(credentials.endpoint || process.env.AMAZON_SHIPPING_API_BASE).replace(/\/+$/, '');
    if (explicit)
        return explicit;
    const sandbox = credentials.sandbox ?? boolFrom(process.env.AMAZON_SHIPPING_SANDBOX);
    const businessId = normalize(credentials.shippingBusinessId || process.env.AMAZON_SHIPPING_BUSINESS_ID);
    const region = normalize(credentials.region || process.env.AMAZON_SHIPPING_REGION).toLowerCase();
    const isNa = region === 'na' || businessId === 'AmazonShipping_US';
    const isFe = region === 'fe' || businessId === 'AmazonShipping_JP';
    const suffix = isNa ? 'na' : isFe ? 'fe' : 'eu';
    return `https://${sandbox ? 'sandbox.' : ''}sellingpartnerapi-${suffix}.amazon.com`;
};
const resolveBusinessId = (credentials) => {
    const value = normalize(credentials.shippingBusinessId || process.env.AMAZON_SHIPPING_BUSINESS_ID || 'AmazonShipping_IN');
    if (!VALID_BUSINESS_IDS.has(value)) {
        throw new classes_1.HttpError(400, `Invalid x-amzn-shipping-business-id: ${value}`);
    }
    return value;
};
const assertBusinessId = (credentials, allowedBusinessIds, operationName) => {
    const businessId = resolveBusinessId(credentials);
    if (!allowedBusinessIds.includes(businessId)) {
        throw new classes_1.HttpError(400, `${operationName} is only supported for ${allowedBusinessIds.join(', ')}; received ${businessId}`);
    }
};
const getAmazonShippingAccessToken = async (credentials) => {
    const envAccessToken = normalize(process.env.AMAZON_SHIPPING_ACCESS_TOKEN);
    const envRefreshToken = normalize(process.env.AMAZON_SHIPPING_REFRESH_TOKEN);
    const directToken = normalize(credentials.accessToken || envAccessToken);
    const refreshToken = normalize(credentials.refreshToken || envRefreshToken);
    const lwaClientId = normalize(credentials.lwaClientId || process.env.AMAZON_SHIPPING_LWA_CLIENT_ID || process.env.AMAZON_LWA_CLIENT_ID);
    const lwaClientSecret = normalize(credentials.lwaClientSecret ||
        process.env.AMAZON_SHIPPING_LWA_CLIENT_SECRET ||
        process.env.AMAZON_LWA_CLIENT_SECRET);
    if (directToken && (credentials.useDirectAccessToken || !refreshToken || !lwaClientId || !lwaClientSecret)) {
        return directToken;
    }
    if (!refreshToken || !lwaClientId || !lwaClientSecret) {
        throw new classes_1.HttpError(400, 'Amazon Shipping access token is required, or configure refreshToken, lwaClientId, and lwaClientSecret');
    }
    const tokenUrl = resolveLwaTokenUrl(credentials);
    const businessId = normalize(credentials.shippingBusinessId || process.env.AMAZON_SHIPPING_BUSINESS_ID);
    try {
        const response = await axios_1.default.post(tokenUrl, new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: lwaClientId,
            client_secret: lwaClientSecret,
        }).toString(), {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            timeout: DEFAULT_TIMEOUT_MS,
        });
        const token = normalize(response.data?.access_token);
        if (!token)
            throw new classes_1.HttpError(502, 'Amazon LWA did not return an access token');
        return token;
    }
    catch (error) {
        if (error instanceof classes_1.HttpError)
            throw error;
        const status = error?.response?.status || 502;
        const message = providerMessage(error, 'Unable to fetch Amazon access token');
        const invalidRefreshToken = isInvalidAmazonRefreshTokenError(error, message);
        console.error('[AmazonShipping] LWA token request failed', {
            status: status || null,
            clientId: redact(lwaClientId),
            message,
            invalidRefreshToken,
            tokenUrl,
            businessId,
            refreshTokenSha: fingerprint(refreshToken),
            refreshTokenMatchesEnv: Boolean(envRefreshToken && refreshToken === envRefreshToken),
        });
        if (directToken && invalidRefreshToken) {
            console.warn('[AmazonShipping] LWA refresh token rejected; using direct access token fallback', {
                status,
                clientId: redact(lwaClientId),
            });
            return directToken;
        }
        const guidance = invalidRefreshToken
            ? `${message}. Re-authorize Amazon Shipping and save a new Atzr| refresh token, or save a fresh Atza| access token as a temporary direct-token fallback.`
            : message;
        throw new classes_1.HttpError(status, `Amazon LWA token request failed: ${guidance}`);
    }
};
exports.getAmazonShippingAccessToken = getAmazonShippingAccessToken;
const validateGetRatesBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new classes_1.HttpError(400, 'GetRatesRequest body must be a JSON object');
    }
    if (!body.channelDetails?.channelType)
        throw new classes_1.HttpError(400, 'channelDetails.channelType is required');
    if (!body.shipFrom)
        throw new classes_1.HttpError(400, 'shipFrom is required');
    if (!Array.isArray(body.packages) || body.packages.length === 0) {
        throw new classes_1.HttpError(400, 'packages must contain at least one package');
    }
    if (body.channelDetails.channelType !== 'AMAZON' && !body.shipTo) {
        throw new classes_1.HttpError(400, 'shipTo is required when channelDetails.channelType is EXTERNAL');
    }
};
const addDefaultAmazonTaxDetails = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return body;
    if (Array.isArray(body.taxDetails) && body.taxDetails.length > 0)
        return body;
    const gstNumber = normalizeAmazonGstNumber(process.env.AMAZON_SHIPPING_GSTIN);
    if (!gstNumber)
        return body;
    return {
        ...body,
        taxDetails: [
            {
                taxType: 'GST',
                taxRegistrationNumber: gstNumber,
            },
        ],
    };
};
const validatePurchaseBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new classes_1.HttpError(400, 'PurchaseShipmentRequest body must be a JSON object');
    }
    if (!body.requestToken)
        throw new classes_1.HttpError(400, 'requestToken is required');
    if (!body.rateId)
        throw new classes_1.HttpError(400, 'rateId is required');
    if (!body.requestedDocumentSpecification) {
        throw new classes_1.HttpError(400, 'requestedDocumentSpecification is required');
    }
};
const validateOneClickBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new classes_1.HttpError(400, 'OneClickShipmentRequest body must be a JSON object');
    }
    if (!body.channelDetails?.channelType)
        throw new classes_1.HttpError(400, 'channelDetails.channelType is required');
    if (!body.shipFrom)
        throw new classes_1.HttpError(400, 'shipFrom is required');
    if (!Array.isArray(body.packages) || body.packages.length === 0) {
        throw new classes_1.HttpError(400, 'packages must contain at least one package');
    }
    if (!body.labelSpecifications)
        throw new classes_1.HttpError(400, 'labelSpecifications is required');
    if (!body.serviceSelection?.serviceId)
        throw new classes_1.HttpError(400, 'serviceSelection.serviceId is required');
    if (body.channelDetails.channelType !== 'AMAZON' && !body.shipTo) {
        throw new classes_1.HttpError(400, 'shipTo is required when channelDetails.channelType is EXTERNAL');
    }
};
const validateTrackingParams = (params) => {
    if (!normalize(params.trackingId))
        throw new classes_1.HttpError(400, 'trackingId is required');
    if (!normalize(params.carrierId))
        throw new classes_1.HttpError(400, 'carrierId is required');
};
const validateDocumentsParams = (params) => {
    if (!normalize(params.shipmentId))
        throw new classes_1.HttpError(400, 'shipmentId is required');
    if (!normalize(params.packageClientReferenceId)) {
        throw new classes_1.HttpError(400, 'packageClientReferenceId is required');
    }
    const dpi = normalize(params.dpi);
    if (dpi && !Number.isFinite(Number(dpi)))
        throw new classes_1.HttpError(400, 'dpi must be a number');
};
const validateShipmentParams = (params) => {
    if (!normalize(params.shipmentId))
        throw new classes_1.HttpError(400, 'shipmentId is required');
};
const validateAccessPointsParams = (params) => {
    const types = normalizeCsvValues(params.accessPointTypes);
    if (!types.length)
        throw new classes_1.HttpError(400, 'accessPointTypes is required');
    if (!normalize(params.countryCode))
        throw new classes_1.HttpError(400, 'countryCode is required');
    if (!normalize(params.postalCode))
        throw new classes_1.HttpError(400, 'postalCode is required');
    const invalidTypes = types.filter((type) => !VALID_ACCESS_POINT_TYPES.has(type));
    if (invalidTypes.length) {
        throw new classes_1.HttpError(400, `Invalid accessPointTypes: ${invalidTypes.join(', ')}`);
    }
    return types;
};
const validateAdditionalInputsParams = (params) => {
    if (!normalize(params.requestToken))
        throw new classes_1.HttpError(400, 'requestToken is required');
    if (!normalize(params.rateId))
        throw new classes_1.HttpError(400, 'rateId is required');
};
const getAmazonRatesRetryDelayMs = (attempt) => Math.min(500 * 2 ** Math.max(0, attempt - 1), 4000);
const validateNdrFeedbackBody = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new classes_1.HttpError(400, 'SubmitNdrFeedbackRequest body must be a JSON object');
    }
    if (!normalize(body.trackingId))
        throw new classes_1.HttpError(400, 'trackingId is required');
    const ndrAction = normalize(body.ndrAction).toUpperCase();
    if (!ndrAction)
        throw new classes_1.HttpError(400, 'ndrAction is required');
    if (!VALID_NDR_ACTIONS.has(ndrAction)) {
        throw new classes_1.HttpError(400, 'ndrAction must be one of RESCHEDULE, REATTEMPT, or RTO');
    }
    if (ndrAction === 'RESCHEDULE' && !normalize(body.ndrRequestData?.rescheduleDate)) {
        throw new classes_1.HttpError(400, 'ndrRequestData.rescheduleDate is required when ndrAction is RESCHEDULE');
    }
    if (ndrAction === 'REATTEMPT' && !normalize(body.ndrRequestData?.additionalAddressNotes)) {
        throw new classes_1.HttpError(400, 'ndrRequestData.additionalAddressNotes is required when ndrAction is REATTEMPT');
    }
    return {
        ...body,
        ndrAction,
    };
};
const requestAmazonShipping = async (credentials, config) => {
    const endpoint = resolveEndpoint(credentials);
    const businessId = resolveBusinessId(credentials);
    const token = await (0, exports.getAmazonShippingAccessToken)(credentials);
    const method = (config.method || 'GET');
    const path = normalize(config.url);
    const traceContext = {
        method,
        path,
        endpoint,
        businessId,
        request: summarizeAmazonRequestData(path, config.data),
    };
    try {
        console.log('[AmazonShipping] API request start', traceContext);
        const response = await axios_1.default.request({
            ...config,
            method,
            url: `${endpoint}${path}`,
            timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': process.env.AMAZON_SHIPPING_USER_AGENT || DEFAULT_USER_AGENT,
                'x-amz-access-token': token,
                'x-amzn-shipping-business-id': businessId,
                ...(config.headers || {}),
            },
        });
        console.log('[AmazonShipping] API request success', {
            method,
            path,
            status: response.status,
            requestId: normalize(response.headers?.['x-amzn-requestid']) || null,
            rateLimit: normalize(response.headers?.['x-amzn-ratelimit-limit']) || null,
            businessId,
        });
        return {
            status: response.status,
            data: response.data,
            amazon: {
                requestId: normalize(response.headers?.['x-amzn-requestid']) || null,
                rateLimit: normalize(response.headers?.['x-amzn-ratelimit-limit']) || null,
            },
        };
    }
    catch (error) {
        const status = error?.response?.status || 502;
        const message = providerMessage(error, `Amazon Shipping ${method} ${path} failed`);
        const requestId = normalize(error?.response?.headers?.['x-amzn-requestid']);
        const rateLimit = normalize(error?.response?.headers?.['x-amzn-ratelimit-limit']);
        const errors = providerErrors(error);
        const providerInternalInputError = isAmazonProviderInternalInputError(errors);
        const logFn = providerInternalInputError ? console.warn.bind(console) : console.error.bind(console);
        logFn('[AmazonShipping] API request failed', {
            ...traceContext,
            status,
            requestId: requestId || null,
            rateLimit: rateLimit || null,
            providerInternalInputError,
            errors,
        });
        const httpError = new classes_1.HttpError(status, `Amazon Shipping ${method} ${path} failed: ${message}`);
        httpError.details = {
            requestId: requestId || null,
            rateLimit: rateLimit || null,
            providerInternalInputError,
            errors,
        };
        throw httpError;
    }
};
const getAmazonShippingRates = async (body, credentials, options = {}) => {
    const requestBody = addDefaultAmazonTaxDetails(body);
    validateGetRatesBody(requestBody);
    const configuredAttempts = Number(process.env.AMAZON_SHIPPING_RATES_ATTEMPTS);
    const requestedAttempts = Number(options.maxAttempts);
    const maxAttempts = Number.isFinite(requestedAttempts) && requestedAttempts > 0
        ? Math.min(Math.floor(requestedAttempts), 6)
        : Number.isFinite(configuredAttempts) && configuredAttempts > 0
            ? Math.min(Math.floor(configuredAttempts), 6)
            : 5;
    const requestedTimeoutMs = Number(options.timeoutMs);
    const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
        ? Math.max(1000, Math.floor(requestedTimeoutMs))
        : undefined;
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const result = await requestAmazonShipping(credentials, {
                method: 'POST',
                url: '/shipping/v2/shipments/rates',
                data: requestBody,
                ...(timeoutMs ? { timeout: timeoutMs } : {}),
            });
            return {
                ...result,
                data: addCourierAliasesToRatesResponse(result.data),
            };
        }
        catch (error) {
            lastError = error;
            if (!isRetryableAmazonRatesError(error) || attempt >= maxAttempts) {
                throw error;
            }
            console.warn('[AmazonShipping] Retrying rates request after provider S-900', {
                attempt,
                nextAttempt: attempt + 1,
                maxAttempts,
                requestId: error?.details?.requestId || null,
                delayMs: getAmazonRatesRetryDelayMs(attempt),
            });
            await sleep(getAmazonRatesRetryDelayMs(attempt));
        }
    }
    throw lastError;
};
exports.getAmazonShippingRates = getAmazonShippingRates;
const purchaseAmazonShipment = async (body, credentials) => {
    validatePurchaseBody(body);
    return requestAmazonShipping(credentials, {
        method: 'POST',
        url: '/shipping/v2/shipments',
        data: body,
        headers: {
            'x-amzn-IdempotencyKey': normalize(credentials.idempotencyKey) || (0, crypto_1.randomUUID)(),
        },
    });
};
exports.purchaseAmazonShipment = purchaseAmazonShipment;
const oneClickAmazonShipment = async (body, credentials) => {
    validateOneClickBody(body);
    return requestAmazonShipping(credentials, {
        method: 'POST',
        url: '/shipping/v2/oneClickShipment',
        data: body,
    });
};
exports.oneClickAmazonShipment = oneClickAmazonShipment;
const getAmazonShippingTracking = async (params, credentials) => {
    validateTrackingParams(params);
    return requestAmazonShipping(credentials, {
        method: 'GET',
        url: '/shipping/v2/tracking',
        params: {
            trackingId: normalize(params.trackingId),
            carrierId: normalize(params.carrierId),
        },
    });
};
exports.getAmazonShippingTracking = getAmazonShippingTracking;
const getAmazonShipmentDocuments = async (params, credentials) => {
    validateDocumentsParams(params);
    const query = {
        packageClientReferenceId: normalize(params.packageClientReferenceId),
    };
    if (normalize(params.format))
        query.format = normalize(params.format);
    if (normalize(params.dpi))
        query.dpi = Number(params.dpi);
    return requestAmazonShipping(credentials, {
        method: 'GET',
        url: `/shipping/v2/shipments/${encodeURIComponent(normalize(params.shipmentId))}/documents`,
        params: query,
    });
};
exports.getAmazonShipmentDocuments = getAmazonShipmentDocuments;
const cancelAmazonShipment = async (params, credentials) => {
    validateShipmentParams(params);
    return requestAmazonShipping(credentials, {
        method: 'PUT',
        url: `/shipping/v2/shipments/${encodeURIComponent(normalize(params.shipmentId))}/cancel`,
    });
};
exports.cancelAmazonShipment = cancelAmazonShipment;
const getAmazonAccessPoints = async (params, credentials) => {
    assertBusinessId(credentials, ['AmazonShipping_UK'], 'getAccessPoints');
    const accessPointTypes = validateAccessPointsParams(params);
    return requestAmazonShipping(credentials, {
        method: 'GET',
        url: '/shipping/v2/accessPoints',
        params: {
            accessPointTypes: accessPointTypes.join(','),
            countryCode: normalize(params.countryCode).toUpperCase(),
            postalCode: normalize(params.postalCode),
        },
    });
};
exports.getAmazonAccessPoints = getAmazonAccessPoints;
const submitAmazonNdrFeedback = async (body, credentials) => {
    assertBusinessId(credentials, ['AmazonShipping_IN'], 'submitNdrFeedback');
    const payload = validateNdrFeedbackBody(body);
    return requestAmazonShipping(credentials, {
        method: 'POST',
        url: '/shipping/v2/ndrFeedback',
        data: payload,
    });
};
exports.submitAmazonNdrFeedback = submitAmazonNdrFeedback;
const getAmazonAdditionalInputs = async (params, credentials) => {
    validateAdditionalInputsParams(params);
    return requestAmazonShipping(credentials, {
        method: 'GET',
        url: '/shipping/v2/shipments/additionalInputs/schema',
        params: {
            requestToken: normalize(params.requestToken),
            rateId: normalize(params.rateId),
        },
    });
};
exports.getAmazonAdditionalInputs = getAmazonAdditionalInputs;
