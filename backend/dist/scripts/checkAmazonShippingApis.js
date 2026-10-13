"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const axios_1 = __importDefault(require("axios"));
const amazonShipping_service_1 = require("../models/services/amazonShipping.service");
const amazonShippingCredentials_service_1 = require("../models/services/amazonShippingCredentials.service");
const originalRequest = axios_1.default.request;
const originalPost = axios_1.default.post;
const capturedRequests = [];
const capturedTokenRequests = [];
let injectedS900RateFailure = false;
const sampleAddress = {
    name: 'Test User',
    addressLine1: '123 Test Street',
    city: 'London',
    stateOrRegion: 'London',
    postalCode: 'SW1A 1AA',
    countryCode: 'GB',
    phoneNumber: '+441234567890',
    email: 'test@example.com',
};
const samplePackage = {
    packageClientReferenceId: 'PKG-POSTMAN-1',
    dimensions: {
        length: 10,
        width: 10,
        height: 10,
        unit: 'CENTIMETER',
    },
    weight: {
        value: 500,
        unit: 'GRAM',
    },
    insuredValue: {
        value: 999,
        unit: 'GBP',
    },
    items: [
        {
            quantity: 1,
            description: 'Test item',
            itemValue: {
                value: 999,
                unit: 'GBP',
            },
            weight: {
                value: 500,
                unit: 'GRAM',
            },
        },
    ],
};
const getRatesBody = {
    channelDetails: {
        channelType: 'EXTERNAL',
    },
    shipFrom: sampleAddress,
    shipTo: sampleAddress,
    packages: [samplePackage],
    shipmentType: 'FORWARD',
};
const labelSpecification = {
    format: 'PDF',
    size: {
        length: 6,
        width: 4,
        unit: 'INCH',
    },
    dpi: 203,
    needFileJoining: false,
    requestedDocumentTypes: ['LABEL'],
};
const baseCredentials = {
    accessToken: 'Atza|direct-token',
    endpoint: 'https://sandbox.sellingpartnerapi-eu.amazon.com',
    shippingBusinessId: 'AmazonShipping_IN',
};
const ukCredentials = {
    ...baseCredentials,
    shippingBusinessId: 'AmazonShipping_UK',
};
const assertLastRequest = (method, path) => {
    const request = capturedRequests[capturedRequests.length - 1];
    (0, assert_1.default)(request, 'Expected an Amazon request to be captured');
    assert_1.default.equal(request.method, method);
    (0, assert_1.default)(request.url?.endsWith(path), `Expected ${request.url} to end with ${path}`);
    assert_1.default.equal(request.headers?.['x-amz-access-token'], 'Atza|direct-token');
    return request;
};
const assertHttpError = async (fn, statusCode, message) => {
    let thrown;
    try {
        await fn();
    }
    catch (error) {
        thrown = error;
    }
    (0, assert_1.default)(thrown, 'Expected operation to throw');
    assert_1.default.equal(thrown.statusCode, statusCode);
    (0, assert_1.default)(String(thrown.message || '').includes(message), `Expected "${thrown.message}" to include "${message}"`);
};
const run = async () => {
    ;
    axios_1.default.request = async (config) => {
        capturedRequests.push(config);
        const isRatesRequest = config.url?.endsWith('/shipping/v2/shipments/rates');
        const packageReference = config.data?.packages?.[0]?.packageClientReferenceId;
        if (isRatesRequest && packageReference === 'PKG-RETRY-S900' && !injectedS900RateFailure) {
            injectedS900RateFailure = true;
            const error = new Error('S-900');
            error.response = {
                status: 400,
                data: {
                    errors: [
                        {
                            code: 'InvalidInput',
                            message: 'Invalid input',
                            details: 'Internal service error. Please contact support for assistance. (S-900)',
                        },
                    ],
                },
                headers: {
                    'x-amzn-requestid': 'amzn-s900-request-id',
                    'x-amzn-ratelimit-limit': '5',
                },
            };
            throw error;
        }
        return {
            status: 200,
            data: isRatesRequest
                ? {
                    payload: {
                        requestToken: 'request-token',
                        rates: [
                            {
                                rateId: 'rate-id',
                                carrierId: 'AMZN_IN',
                                carrierName: 'Amazon Shipping',
                                serviceId: 'amazon-standard',
                            },
                        ],
                    },
                }
                : {
                    ok: true,
                },
            headers: {
                'x-amzn-requestid': 'amzn-request-id',
                'x-amzn-ratelimit-limit': '5',
            },
        };
    };
    axios_1.default.post = async (url, data) => {
        capturedTokenRequests.push({ url, data });
        if (data.includes('bad-refresh-token')) {
            const error = new Error('invalid_grant');
            error.response = {
                status: 400,
                data: {
                    error: 'invalid_grant',
                    error_description: "The request has an invalid grant parameter : refresh_token. User may have revoked or didn't grant the permission.",
                },
            };
            throw error;
        }
        return {
            status: 200,
            data: {
                access_token: 'Atza|fresh-token',
            },
            headers: {},
        };
    };
    const ratesResult = await (0, amazonShipping_service_1.getAmazonShippingRates)(getRatesBody, baseCredentials);
    assertLastRequest('POST', '/shipping/v2/shipments/rates');
    assert_1.default.equal(ratesResult.data.payload.rates[0].courier_id, 'AMZN_IN');
    assert_1.default.equal(ratesResult.data.payload.rates[0].courier_name, 'Amazon Shipping');
    assert_1.default.equal(ratesResult.data.payload.rates[0].courierId, 'AMZN_IN');
    assert_1.default.equal(ratesResult.data.payload.rates[0].courierName, 'Amazon Shipping');
    const retryStartCount = capturedRequests.length;
    const retriedRatesResult = await (0, amazonShipping_service_1.getAmazonShippingRates)({
        ...getRatesBody,
        packages: [
            {
                ...samplePackage,
                packageClientReferenceId: 'PKG-RETRY-S900',
            },
        ],
    }, baseCredentials);
    assert_1.default.equal(capturedRequests.length - retryStartCount, 2);
    assert_1.default.equal(retriedRatesResult.data.payload.rates[0].courier_id, 'AMZN_IN');
    const warehouse = (0, amazonShipping_service_1.createAmazonShippingWarehouse)({
        alias: 'Main Warehouse',
        contactName: 'Warehouse Manager',
        contactPhone: '9876543210',
        contactEmail: 'ops@example.com',
        addressLine1: 'A very long pickup address line that should be split safely for Amazon Shipping',
        addressLine2: 'Industrial Area Phase 1',
        city: 'Jaipur',
        state: 'Rajasthan',
        country: 'India',
        pincode: '302001',
        latitude: '26.9124',
        longitude: '75.7873',
    });
    assert_1.default.equal(warehouse.provider, 'amazon');
    assert_1.default.equal(warehouse.shipFrom.countryCode, 'IN');
    assert_1.default.equal(warehouse.shipFrom.postalCode, '302001');
    assert_1.default.equal(warehouse.shipFrom.phoneNumber, '+919876543210');
    (0, assert_1.default)(warehouse.shipFrom.addressLine1.length <= 60);
    (0, assert_1.default)(warehouse.shipFrom.addressLine2 && warehouse.shipFrom.addressLine2.length <= 60);
    assert_1.default.equal(warehouse.shipFrom.geocode?.latitude, '26.9124');
    await (0, amazonShipping_service_1.purchaseAmazonShipment)({
        requestToken: 'request-token',
        rateId: 'rate-id',
        requestedDocumentSpecification: labelSpecification,
    }, { ...baseCredentials, idempotencyKey: 'purchase-test' });
    const purchaseRequest = assertLastRequest('POST', '/shipping/v2/shipments');
    assert_1.default.equal(purchaseRequest.headers?.['x-amzn-IdempotencyKey'], 'purchase-test');
    await (0, amazonShipping_service_1.oneClickAmazonShipment)({
        ...getRatesBody,
        labelSpecifications: labelSpecification,
        serviceSelection: {
            serviceId: 'service-id',
        },
    }, baseCredentials);
    assertLastRequest('POST', '/shipping/v2/oneClickShipment');
    await (0, amazonShipping_service_1.getAmazonShippingTracking)({
        trackingId: 'tracking-id',
        carrierId: 'carrier-id',
    }, baseCredentials);
    const trackingRequest = assertLastRequest('GET', '/shipping/v2/tracking');
    assert_1.default.equal(trackingRequest.params?.trackingId, 'tracking-id');
    assert_1.default.equal(trackingRequest.params?.carrierId, 'carrier-id');
    await (0, amazonShipping_service_1.getAmazonShipmentDocuments)({
        shipmentId: 'shipment-id',
        packageClientReferenceId: 'PKG-POSTMAN-1',
        format: 'PDF',
        dpi: 203,
    }, baseCredentials);
    const documentsRequest = assertLastRequest('GET', '/shipping/v2/shipments/shipment-id/documents');
    assert_1.default.equal(documentsRequest.params?.packageClientReferenceId, 'PKG-POSTMAN-1');
    await (0, amazonShipping_service_1.cancelAmazonShipment)({ shipmentId: 'shipment-id' }, baseCredentials);
    assertLastRequest('PUT', '/shipping/v2/shipments/shipment-id/cancel');
    await (0, amazonShipping_service_1.getAmazonAccessPoints)({
        accessPointTypes: ['HELIX', 'CORE_LOCKER'],
        countryCode: 'gb',
        postalCode: 'SW1A 1AA',
    }, ukCredentials);
    const accessPointsRequest = assertLastRequest('GET', '/shipping/v2/accessPoints');
    assert_1.default.equal(accessPointsRequest.params?.accessPointTypes, 'HELIX,CORE_LOCKER');
    assert_1.default.equal(accessPointsRequest.params?.countryCode, 'GB');
    await (0, amazonShipping_service_1.submitAmazonNdrFeedback)({
        trackingId: 'tracking-id',
        ndrAction: 'reschedule',
        ndrRequestData: {
            rescheduleDate: '2026-05-12T10:00:00.000Z',
        },
    }, baseCredentials);
    const ndrRequest = assertLastRequest('POST', '/shipping/v2/ndrFeedback');
    assert_1.default.equal(ndrRequest.data?.ndrAction, 'RESCHEDULE');
    await (0, amazonShipping_service_1.getAmazonAdditionalInputs)({
        requestToken: 'request-token',
        rateId: 'rate-id',
    }, baseCredentials);
    const additionalInputsRequest = assertLastRequest('GET', '/shipping/v2/shipments/additionalInputs/schema');
    assert_1.default.equal(additionalInputsRequest.params?.requestToken, 'request-token');
    assert_1.default.equal(additionalInputsRequest.params?.rateId, 'rate-id');
    const refreshedToken = await (0, amazonShipping_service_1.getAmazonShippingAccessToken)({
        accessToken: 'Atza|stale-stored-token',
        refreshToken: 'Atzr|refresh-token',
        lwaClientId: 'lwa-client-id',
        lwaClientSecret: 'lwa-client-secret',
        shippingBusinessId: 'AmazonShipping_UK',
    });
    assert_1.default.equal(refreshedToken, 'Atza|fresh-token');
    assert_1.default.equal(capturedTokenRequests[capturedTokenRequests.length - 1].url, 'https://api.amazon.co.uk/auth/o2/token');
    const fallbackTokenRequestCount = capturedTokenRequests.length;
    const fallbackToken = await (0, amazonShipping_service_1.getAmazonShippingAccessToken)({
        accessToken: 'Atza|fallback-token',
        refreshToken: 'Atzr|bad-refresh-token',
        lwaClientId: 'lwa-client-id',
        lwaClientSecret: 'lwa-client-secret',
        shippingBusinessId: 'AmazonShipping_UK',
    });
    assert_1.default.equal(fallbackToken, 'Atza|fallback-token');
    assert_1.default.equal(capturedTokenRequests.length, fallbackTokenRequestCount + 1);
    await assertHttpError(() => (0, amazonShipping_service_1.getAmazonShippingAccessToken)({
        refreshToken: 'Atzr|bad-refresh-token',
        lwaClientId: 'lwa-client-id',
        lwaClientSecret: 'lwa-client-secret',
        shippingBusinessId: 'AmazonShipping_UK',
    }), 400, 'Re-authorize Amazon Shipping');
    const envMergedCredentials = (0, amazonShippingCredentials_service_1.mergeAmazonShippingCredentialsWithEnv)({
        refreshToken: 'Atzr|db-refresh-token',
        lwaClientId: 'db-client-id',
        lwaClientSecret: 'db-client-secret',
        shippingBusinessId: 'AmazonShipping_IN',
    }, {
        AMAZON_SHIPPING_REFRESH_TOKEN: 'Atzr|env-refresh-token',
        AMAZON_SHIPPING_LWA_CLIENT_ID: 'env-client-id',
        AMAZON_SHIPPING_LWA_CLIENT_SECRET: 'env-client-secret',
        AMAZON_SHIPPING_BUSINESS_ID: 'AmazonShipping_IN',
        AMAZON_SHIPPING_REGION: 'eu',
        AMAZON_SHIPPING_SANDBOX: 'false',
    });
    assert_1.default.equal(envMergedCredentials.refreshToken, 'Atzr|env-refresh-token');
    assert_1.default.equal(envMergedCredentials.lwaClientId, 'env-client-id');
    assert_1.default.equal(envMergedCredentials.lwaClientSecret, 'env-client-secret');
    const originalEnvRefreshToken = process.env.AMAZON_SHIPPING_REFRESH_TOKEN;
    try {
        process.env.AMAZON_SHIPPING_REFRESH_TOKEN = 'Atzr|env-refresh-token';
        (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)({ refreshToken: 'Atzr|db-refresh-token' });
        assert_1.default.equal(process.env.AMAZON_SHIPPING_REFRESH_TOKEN, 'Atzr|env-refresh-token');
        (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)({ refreshToken: 'Atzr|admin-updated-refresh-token' }, { overwriteExisting: true });
        assert_1.default.equal(process.env.AMAZON_SHIPPING_REFRESH_TOKEN, 'Atzr|admin-updated-refresh-token');
    }
    finally {
        if (originalEnvRefreshToken === undefined) {
            delete process.env.AMAZON_SHIPPING_REFRESH_TOKEN;
        }
        else {
            process.env.AMAZON_SHIPPING_REFRESH_TOKEN = originalEnvRefreshToken;
        }
    }
    const tokenRequestCount = capturedTokenRequests.length;
    const directTokenRatesResult = await (0, amazonShipping_service_1.getAmazonShippingRates)(getRatesBody, {
        ...baseCredentials,
        refreshToken: 'Atzr|refresh-token',
        lwaClientId: 'lwa-client-id',
        lwaClientSecret: 'lwa-client-secret',
        useDirectAccessToken: true,
    });
    assert_1.default.equal(capturedTokenRequests.length, tokenRequestCount);
    assertLastRequest('POST', '/shipping/v2/shipments/rates');
    assert_1.default.equal(directTokenRatesResult.data.payload.rates[0].courier_id, 'AMZN_IN');
    await assertHttpError(() => (0, amazonShipping_service_1.getAmazonAccessPoints)({
        accessPointTypes: ['HELIX'],
        countryCode: 'IN',
        postalCode: '110001',
    }, baseCredentials), 400, 'AmazonShipping_UK');
    await assertHttpError(() => (0, amazonShipping_service_1.submitAmazonNdrFeedback)({
        trackingId: 'tracking-id',
        ndrAction: 'RTO',
    }, ukCredentials), 400, 'AmazonShipping_IN');
    console.log('Amazon Shipping API flow checks passed.');
};
run()
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
})
    .finally(() => {
    ;
    axios_1.default.request = originalRequest;
    axios_1.default.post = originalPost;
});
