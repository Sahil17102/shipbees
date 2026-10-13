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
const requireBearerToken = (req) => {
    strict_1.default.equal(req.headers.authorization, 'Bearer mock-xpressbees-token');
    strict_1.default.equal(req.headers.token, 'mock-xpressbees-token');
};
const requireVersionHeader = (req) => {
    strict_1.default.equal(req.headers.versionnumber, 'v1');
};
const requireXbKey = (req) => {
    strict_1.default.equal(req.headers.xbkey, 'mock-xb-key');
};
const startMockXpressbeesServer = async () => {
    const captured = [];
    const server = node_http_1.default.createServer(async (req, res) => {
        try {
            const body = await readJsonBody(req);
            const url = req.url || '';
            captured.push({
                method: req.method || '',
                url,
                authorization: req.headers.authorization,
                token: req.headers.token,
                xbkey: req.headers.xbkey,
                body,
            });
            if (req.method === 'POST' && url === '/api/users/login') {
                strict_1.default.equal(body?.email, 'ops@example.com');
                strict_1.default.equal(body?.password, 'mock-password');
                return sendJson(res, 200, {
                    status: true,
                    data: {
                        token: 'mock-xpressbees-token',
                    },
                });
            }
            if (req.method === 'POST' && url === '/api/auth/generateToken') {
                strict_1.default.equal(req.headers.authorization, 'Bearer mock-auth-bootstrap');
                strict_1.default.equal(body?.username, 'ops@example.com');
                strict_1.default.equal(body?.password, 'mock-password');
                strict_1.default.equal(body?.secretkey, 'mock-secret');
                return sendJson(res, 200, {
                    token: 'mock-xpressbees-token',
                    code: 200,
                });
            }
            if (req.method === 'POST' && url === '/POSTShipmentService.svc/AWBNumberSeriesGeneration') {
                requireXbKey(req);
                strict_1.default.equal(body?.BusinessUnit, 'ECOM');
                strict_1.default.equal(body?.ServiceType, 'FORWARD');
                strict_1.default.equal(body?.DeliveryType, 'PREPAID');
                return sendJson(res, 200, {
                    ReturnMessage: 'Successful',
                    ReturnCode: 100,
                    BatchID: 'XBATCH001',
                });
            }
            if (req.method === 'POST' && url === '/TrackingService.svc/GetAWBNumberGeneratedSeries') {
                requireXbKey(req);
                strict_1.default.equal(body?.BusinessUnit, 'ECOM');
                strict_1.default.equal(body?.ServiceType, 'FORWARD');
                strict_1.default.equal(body?.BatchID, 'XBATCH001');
                return sendJson(res, 200, {
                    ReturnMessage: 'Successful',
                    ReturnCode: 100,
                    AWBNoGenRequestedDateTime: '21-07-2017 16:52:39',
                    BatchID: 'XBATCH001',
                    AWBNoSeries: ['111171900000', '111171900001'],
                });
            }
            if (req.method === 'POST' && url === '/api/courier/serviceability') {
                requireBearerToken(req);
                strict_1.default.equal(body?.origin, '122001');
                strict_1.default.equal(body?.destination, '400001');
                strict_1.default.equal(body?.payment_type, 'cod');
                strict_1.default.equal(body?.order_amount, '499');
                strict_1.default.equal(body?.weight, '500');
                return sendJson(res, 200, {
                    status: true,
                    data: [
                        {
                            id: '14',
                            name: 'Xpressbees Surface',
                            freight_charges: 67.4,
                            cod_charges: 41.3,
                            total_charges: 108.7,
                            min_weight: 500,
                            chargeable_weight: 500,
                        },
                    ],
                });
            }
            if (req.method === 'POST' && url === '/expose/get/serviceabilitypincode/details') {
                requireBearerToken(req);
                requireVersionHeader(req);
                strict_1.default.equal(body?.BusinessUnit, 'eComm');
                strict_1.default.equal(body?.BusinessFlow, 'Forward');
                strict_1.default.ok(['PickUp', 'Delivery'].includes(body?.BusinessService));
                const pincode = body.BusinessService === 'PickUp'
                    ? 122001
                    : body.BusinessService === 'Delivery'
                        ? 400001
                        : 999999;
                return sendJson(res, 200, {
                    ReturnCode: 100,
                    ReturnMessage: 'success',
                    ServicablePincodeDetails: [
                        {
                            rowid: '1',
                            businessunit: 'eComm',
                            businessflow: 'Forward',
                            businessservice: body.BusinessService,
                            pincode,
                            HubName: body.BusinessService === 'PickUp' ? 'DEL/GGN' : 'BOM/TEC',
                            processcode: 'N/A-01/1B',
                            rtoprocesscode: '',
                            statename: body.BusinessService === 'PickUp' ? 'HARYANA' : 'MAHARASHTRA',
                            cityname: body.BusinessService === 'PickUp' ? 'GURGAON' : 'MUMBAI',
                        },
                    ],
                });
            }
            if (req.method === 'GET' && url === '/api/courier') {
                requireBearerToken(req);
                return sendJson(res, 200, {
                    status: true,
                    data: [
                        {
                            id: '14',
                            name: 'Xpressbees Surface',
                        },
                    ],
                });
            }
            if (req.method === 'POST' && url === '/api/shipments2') {
                requireBearerToken(req);
                strict_1.default.equal(body?.order_number, 'XB_TEST_ORDER');
                strict_1.default.equal(body?.payment_type, 'cod');
                strict_1.default.equal(body?.package_weight, 500);
                strict_1.default.equal(body?.collectable_amount, '499');
                strict_1.default.equal(body?.courier_id, '14');
                strict_1.default.equal(body?.consignee?.pincode, '400001');
                strict_1.default.equal(body?.pickup?.pincode, '122001');
                return sendJson(res, 200, {
                    status: true,
                    data: {
                        order_id: 3351555,
                        shipment_id: 1929242,
                        awb_number: 'XB1234567890',
                        courier_id: '14',
                        courier_name: 'Xpressbees Surface',
                        status: 'booked',
                        additional_info: 'BOM / TEC',
                        payment_type: 'cod',
                        label: 'https://xb-files.s3.amazonaws.com/labels/mock.pdf',
                    },
                });
            }
            if (req.method === 'POST' && url === '/GetShipmentAuditLog') {
                requireBearerToken(req);
                requireVersionHeader(req);
                strict_1.default.equal(body?.AWBNumber, 'XB1234567890');
                return sendJson(res, 200, {
                    ReturnCode: 100,
                    ReturnMessage: 'Successful',
                    ShipmentLogDetails: [
                        {
                            ShipmentStatus: 'DLVD',
                            ShipmentStatusDateTime: '14-01-2021 19:09:23',
                            Description: 'Delivered',
                            HubLocation: 'PNQ/HUB',
                            City: 'PUNE',
                            State: 'MAHARASHTRA',
                            Process: 'Shipment Delivered',
                        },
                        {
                            ShipmentStatus: 'IT',
                            ShipmentStatusDateTime: '14-01-2021 19:07:18',
                            Description: 'InTransit',
                            HubLocation: 'PNQ/HUB',
                            City: 'PUNE',
                            State: 'MAHARASHTRA',
                            Process: 'BagInScan',
                        },
                    ],
                });
            }
            if (req.method === 'POST' && url === '/GetCurrentShipmentStatus') {
                requireBearerToken(req);
                requireVersionHeader(req);
                strict_1.default.equal(body?.AWBNumber, 'XB1234567890');
                return sendJson(res, 200, {
                    ReturnCode: 100,
                    ReturnMessage: 'Successful',
                    ShipmentStatusDetails: [
                        {
                            AWBNumber: 'XB1234567890',
                            ShipmentStatus: 'IT',
                            ShipmentStatusDateTime: '14-01-2021 19:07:18',
                            Description: 'InTransit',
                            HubLocation: 'PNQ/HUB',
                            City: 'PUNE',
                            State: 'MAHARASHTRA',
                            Process: 'BagInScan',
                        },
                    ],
                });
            }
            if (req.method === 'POST' && url === '/shipmentmanifestation/forward') {
                requireBearerToken(req);
                requireVersionHeader(req);
                strict_1.default.equal(body?.AirWayBillNO, 'XB1234567890');
                strict_1.default.equal(body?.BusinessAccountName, 'Mock Business Account');
                strict_1.default.equal(body?.OrderNo, 'XB_TEST_ORDER');
                strict_1.default.equal(body?.OrderType, 'COD');
                strict_1.default.equal(body?.CollectibleAmount, '499.00');
                strict_1.default.equal(body?.ServiceType, 'SFC');
                strict_1.default.equal(body?.PickupDetails?.PickupVendorCode, 'MOCKVENDOR001');
                strict_1.default.equal(body?.DropDetails?.Addresses?.[0]?.PinCode, '400001');
                strict_1.default.equal(body?.PickupDetails?.Addresses?.[0]?.PinCode, '122001');
                strict_1.default.equal(body?.RTODetails?.Addresses?.[0]?.PinCode, '122001');
                return sendJson(res, 200, {
                    AWBNo: 'XB1234567890',
                    ReturnCode: 100,
                    ReturnMessage: 'successful',
                    TokenNumber: '255_M34_14042019',
                });
            }
            if (req.method === 'POST' && url === '/api/shipments2/manifest') {
                requireBearerToken(req);
                strict_1.default.deepEqual(body?.awbs, ['XB1234567890']);
                return sendJson(res, 200, {
                    status: true,
                    data: 'https://xb-files.s3.amazonaws.com/manifest/mock.pdf',
                });
            }
            if (req.method === 'POST' && url === '/forwardcancellation') {
                requireBearerToken(req);
                strict_1.default.equal(body?.ShippingID, 'XB1234567890');
                strict_1.default.equal(body?.CancellationReason, 'Cancelled By Customer');
                return sendJson(res, 200, {
                    ShippingID: 'XB1234567890',
                    ReturnCode: 100,
                    ReturnMessage: 'Shipment Updated Successfully',
                });
            }
            if (req.method === 'POST' && url === '/api/shipments2/cancel') {
                requireBearerToken(req);
                strict_1.default.equal(body?.awb, 'XB1234567890');
                return sendJson(res, 200, {
                    status: true,
                    message: 'Shipment Cancelled',
                });
            }
            if (req.method === 'GET' && url === '/api/ndr') {
                requireBearerToken(req);
                return sendJson(res, 200, {
                    status: true,
                    data: [
                        {
                            awb_number: 'XB1234567890',
                            event_date: '2026-05-17',
                            courier_remarks: 'Customer Not Responding',
                            total_attempts: '1',
                        },
                    ],
                });
            }
            if (req.method === 'POST' && url === '/client/UpdateNDRDeferredDeliveryDate') {
                requireBearerToken(req);
                requireVersionHeader(req);
                strict_1.default.equal(body?.ShippingID, 'XB1234567890');
                strict_1.default.equal(body?.DeferredDeliveryDate, '18-05-2026 12:00:00');
                return sendJson(res, 200, {
                    ShippingID: 'XB1234567890',
                    ReturnCode: 100,
                    ReturnMessage: 'Successful',
                });
            }
            if (req.method === 'POST' && url === '/api/ndr/create') {
                requireBearerToken(req);
                strict_1.default.equal(body?.[0]?.awb, 'XB1234567890');
                strict_1.default.equal(body?.[0]?.action, 're-attempt');
                return sendJson(res, 200, [
                    {
                        status: true,
                        awb: 'XB1234567890',
                        message: 'NDR Submitted Successfully',
                    },
                ]);
            }
            if (req.method === 'POST' && url === '/api/reverseshipments') {
                requireBearerToken(req);
                strict_1.default.equal(body?.order_id, 'XB_TEST_ORDER');
                strict_1.default.equal(body?.consignee?.pincode, '400001');
                strict_1.default.equal(body?.pickup?.pincode, '122001');
                return sendJson(res, 200, {
                    status: true,
                    data: {
                        order_id: 'XB_TEST_ORDER',
                        shipment_id: 'REV1929242',
                        awb_number: 'XBR1234567890',
                        courier_id: '14',
                        courier_name: 'Xpressbees Reverse',
                        status: 'booked',
                        label: 'https://xb-files.s3.amazonaws.com/labels/reverse-mock.pdf',
                    },
                });
            }
            return sendJson(res, 404, { message: `Unhandled mock endpoint ${req.method} ${url}` });
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
const main = async () => {
    const mock = await startMockXpressbeesServer();
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL =
        process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/postgres';
    process.env.XPRESSBEES_API_BASE = mock.baseUrl;
    process.env.XPRESSBEES_API_TOKEN = '';
    process.env.XPRESSBEES_SKIP_TOKEN_PERSIST = 'true';
    process.env.XPRESSBEES_AUTH_BEARER = 'mock-auth-bootstrap';
    process.env.XPRESSBEES_USERNAME = 'ops@example.com';
    process.env.XPRESSBEES_PASSWORD = 'mock-password';
    process.env.XPRESSBEES_SECRET_KEY = 'mock-secret';
    process.env.XPRESSBEES_XB_KEY = 'mock-xb-key';
    process.env.XPRESSBEES_BUSINESS_ACCOUNT_NAME = 'Mock Business Account';
    process.env.XPRESSBEES_PICKUP_VENDOR_CODE = 'MOCKVENDOR001';
    process.env.XPRESSBEES_MANIFEST_SERVICE_TYPE = 'SD';
    process.env.XPRESSBEES_MANIFEST_PICKUP_TYPE = 'Vendor';
    process.env.XPRESSBEES_PINCODE_BUSINESS_UNIT = 'eComm';
    process.env.XPRESSBEES_PINCODE_BUSINESS_FLOW = 'Forward';
    process.env.XPRESSBEES_PICKUP_BUSINESS_SERVICE = 'PickUp';
    process.env.XPRESSBEES_DELIVERY_BUSINESS_SERVICE = 'Delivery';
    process.env.XPRESSBEES_SERVICEABILITY_VERSION = 'v1';
    process.env.XPRESSBEES_TOKEN_ENDPOINT = '/api/users/login';
    process.env.XPRESSBEES_TOKEN_ENDPOINTS = `${mock.baseUrl}/api/auth/generateToken`;
    process.env.XPRESSBEES_SHIPMENT_ENDPOINT = '/api/shipments2';
    process.env.XPRESSBEES_SHIPMENT_ENDPOINTS = '/api/shipments2';
    process.env.XPRESSBEES_REVERSE_SHIPMENT_ENDPOINT = '/api/reverseshipments';
    process.env.XPRESSBEES_SERVICEABILITY_ENDPOINTS = `${mock.baseUrl}/expose/get/serviceabilitypincode/details`;
    process.env.XPRESSBEES_TRACK_ENDPOINTS = `${mock.baseUrl}/GetShipmentAuditLog`;
    process.env.XPRESSBEES_CURRENT_TRACK_ENDPOINTS = `${mock.baseUrl}/GetCurrentShipmentStatus`;
    process.env.XPRESSBEES_MANIFEST_ENDPOINTS = `${mock.baseUrl}/shipmentmanifestation/forward,${mock.baseUrl}/api/shipments2/manifest`;
    process.env.XPRESSBEES_CANCEL_ENDPOINTS = `${mock.baseUrl}/forwardcancellation`;
    process.env.XPRESSBEES_NDR_ACTION_ENDPOINTS = `${mock.baseUrl}/client/UpdateNDRDeferredDeliveryDate`;
    process.env.XPRESSBEES_AWB_GENERATION_ENDPOINTS = `${mock.baseUrl}/POSTShipmentService.svc/AWBNumberSeriesGeneration`;
    process.env.XPRESSBEES_AWB_SERIES_ENDPOINTS = `${mock.baseUrl}/TrackingService.svc/GetAWBNumberGeneratedSeries`;
    try {
        const { XpressbeesService } = await Promise.resolve().then(() => __importStar(require('../models/services/couriers/xpressbees.service')));
        XpressbeesService.cachedConfig = null;
        const xpressbees = new XpressbeesService();
        const serviceability = await xpressbees.checkServiceability({
            origin: '122001',
            destination: '400001',
            payment_type: 'cod',
            order_amount: '499',
            weight: '500',
            length: '10',
            breadth: '10',
            height: '10',
        });
        strict_1.default.equal(serviceability.serviceable, true);
        strict_1.default.equal(serviceability.codAvailable, true);
        strict_1.default.equal(serviceability.mode, 'xbees_pincode_master');
        strict_1.default.equal(serviceability.records[0]?.id, 'xpressbees-route');
        const awbBatch = await xpressbees.requestAwbNumberSeries({ deliveryType: 'prepaid' });
        strict_1.default.equal(awbBatch?.ReturnCode, 100);
        strict_1.default.equal(awbBatch?.BatchID, 'XBATCH001');
        const awbSeries = await xpressbees.getGeneratedAwbNumberSeries('XBATCH001');
        strict_1.default.equal(awbSeries?.ReturnCode, 100);
        strict_1.default.equal(awbSeries?.AWBNoSeries?.[0], '111171900000');
        const generatedAwb = await xpressbees.generateAwbNumber({ deliveryType: 'prepaid' });
        strict_1.default.equal(generatedAwb.awb, '111171900000');
        strict_1.default.equal(generatedAwb.batchId, 'XBATCH001');
        strict_1.default.deepEqual(generatedAwb.awbs, ['111171900000', '111171900001']);
        const couriers = await xpressbees.listCouriers();
        strict_1.default.equal(couriers?.status, true);
        strict_1.default.equal(couriers?.data?.[0]?.name, 'Xpressbees Surface');
        const shipment = await xpressbees.createShipment({
            order_number: 'XB_TEST_ORDER',
            unique_order_number: 'yes',
            shipping_charges: 40,
            discount: 0,
            cod_charges: 30,
            payment_type: 'cod',
            order_amount: 499,
            package_weight: 500,
            package_length: 10,
            package_breadth: 10,
            package_height: 10,
            request_auto_pickup: 'yes',
            courier_id: '14',
            collectable_amount: 499,
            consignee: {
                name: 'Test Buyer',
                address: 'Fort',
                address_2: '',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                phone: '9876543210',
            },
            pickup: {
                warehouse_name: 'NCR Warehouse',
                name: 'Ops User',
                address: 'MG Road',
                address_2: '',
                city: 'Gurgaon',
                state: 'Haryana',
                pincode: '122001',
                phone: '9876543210',
            },
            order_items: [
                {
                    name: 'Test Product',
                    sku: 'SKU-XB-1',
                    qty: 1,
                    price: 499,
                },
            ],
        });
        strict_1.default.equal(shipment.status, true);
        strict_1.default.equal(shipment.data?.awb_number, 'XB1234567890');
        const tracking = await xpressbees.trackShipment('XB1234567890');
        strict_1.default.equal(tracking?.ReturnCode, 100);
        strict_1.default.equal(tracking?.ShipmentLogDetails?.[0]?.ShipmentStatus, 'DLVD');
        const currentTracking = await xpressbees.trackCurrentShipment('XB1234567890');
        strict_1.default.equal(currentTracking?.ReturnCode, 100);
        strict_1.default.equal(currentTracking?.ShipmentStatusDetails?.[0]?.ShipmentStatus, 'IT');
        const manifest = await xpressbees.generateManifest([
            {
                order_number: 'XB_TEST_ORDER',
                order_type: 'cod',
                order_amount: 499,
                awb_number: 'XB1234567890',
                provider_service: 'surface',
                buyer_name: 'Test Buyer',
                buyer_phone: '9876543210',
                buyer_email: 'buyer@example.com',
                address: 'Fort',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                products: [{ name: 'Test Product', sku: 'SKU-XB-1', qty: 1, price: 499 }],
                weight: 500,
                length: 10,
                breadth: 10,
                height: 10,
                pickup_details: {
                    warehouse_name: 'NCR Warehouse',
                    name: 'Ops User',
                    address: 'MG Road',
                    city: 'Gurgaon',
                    state: 'Haryana',
                    pincode: '122001',
                    phone: '9876543210',
                },
            },
        ]);
        strict_1.default.equal(manifest?.ReturnCode, 100);
        const legacyManifest = await xpressbees.generateManifest(['XB1234567890']);
        strict_1.default.equal(legacyManifest?.status, true);
        const cancellation = await xpressbees.cancelShipment('XB1234567890');
        strict_1.default.equal(cancellation?.ReturnCode, 100);
        const ndrList = await xpressbees.listNdr();
        strict_1.default.equal(ndrList?.data?.[0]?.awb_number, 'XB1234567890');
        const ndrAction = await xpressbees.submitNdrAction([
            {
                awb: 'XB1234567890',
                action: 're-attempt',
                action_data: {
                    re_attempt_date: '2026-05-18',
                },
            },
        ]);
        strict_1.default.equal(ndrAction?.ReturnCode, 100);
        const reverseShipment = await xpressbees.createReverseShipment({
            order_id: 'XB_TEST_ORDER',
            request_auto_pickup: 'yes',
            consignee: {
                name: 'Test Buyer',
                address: 'Fort',
                city: 'Mumbai',
                state: 'Maharashtra',
                pincode: '400001',
                phone: '9876543210',
            },
            pickup: {
                warehouse_name: 'NCR Warehouse',
                name: 'Ops User',
                address: 'MG Road',
                city: 'Gurgaon',
                state: 'Haryana',
                pincode: '122001',
                phone: '9876543210',
            },
            package_weight: 500,
            package_length: 10,
            package_breadth: 10,
            package_height: 10,
            product_name: 'Return Item',
            product_amount: 499,
        });
        strict_1.default.equal(reverseShipment.data?.awb_number, 'XBR1234567890');
        const summary = {
            authCalls: mock.captured.filter((req) => req.url === '/api/users/login' || req.url === '/api/auth/generateToken').length,
            serviceabilityCalls: mock.captured.filter((req) => req.url === '/expose/get/serviceabilitypincode/details').length,
            awbBatchCalls: mock.captured.filter((req) => req.url === '/POSTShipmentService.svc/AWBNumberSeriesGeneration').length,
            awbSeriesCalls: mock.captured.filter((req) => req.url === '/TrackingService.svc/GetAWBNumberGeneratedSeries').length,
            shipmentCalls: mock.captured.filter((req) => req.url === '/api/shipments2').length,
            trackingCalls: mock.captured.filter((req) => req.url === '/GetShipmentAuditLog').length,
            currentTrackingCalls: mock.captured.filter((req) => req.url === '/GetCurrentShipmentStatus')
                .length,
            preShipManifestCalls: mock.captured.filter((req) => req.url === '/shipmentmanifestation/forward').length,
            manifestCalls: mock.captured.filter((req) => req.url === '/api/shipments2/manifest').length,
            cancelCalls: mock.captured.filter((req) => req.url === '/forwardcancellation').length,
            ndrCalls: mock.captured.filter((req) => req.url === '/api/ndr').length,
            ndrActionCalls: mock.captured.filter((req) => req.url === '/client/UpdateNDRDeferredDeliveryDate').length,
            reverseShipmentCalls: mock.captured.filter((req) => req.url === '/api/reverseshipments')
                .length,
            serviceable: serviceability.serviceable,
            generatedAwb: generatedAwb.awb,
            awb: shipment.data?.awb_number,
            reverseAwb: reverseShipment.data?.awb_number,
        };
        console.log('Xpressbees integration mock checks passed');
        console.log(JSON.stringify(summary, null, 2));
    }
    finally {
        await mock.close();
    }
};
main().catch((error) => {
    console.error('Xpressbees integration mock checks failed');
    console.error(error);
    process.exit(1);
});
