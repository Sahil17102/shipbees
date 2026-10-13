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
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
});
const json = (res, body) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
};
const main = async () => {
    const seen = [];
    const server = node_http_1.default.createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const bodyBuffer = await readBody(req);
        const bodyText = bodyBuffer.toString('utf8');
        const body = /application\/json/.test(String(req.headers['content-type'])) && bodyText ? JSON.parse(bodyText) : null;
        seen.push(`${req.method} ${url.pathname}`);
        if (url.pathname === '/v1/access/login') {
            strict_1.default.deepEqual(body, { username: 'uat-user', password: 'uat-pass' });
            return json(res, { success: true, data: { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600, refresh_expires_in: 7200 } });
        }
        if (url.pathname === '/v1/access/TokenWithRtoken') {
            strict_1.default.equal(req.headers.authorization, 'Bearer refresh-token');
            return json(res, { access_token: 'refreshed-access-token', refresh_token: 'refresh-token', expires_in: 3600, refresh_expires_in: 7200 });
        }
        strict_1.default.equal(req.headers.authorization, 'Bearer refreshed-access-token');
        if (url.pathname === '/v1/speed-post/tariffs') {
            strict_1.default.equal(url.searchParams.get('product-code'), 'SP');
            strict_1.default.equal(url.searchParams.get('source-pincode'), '400001');
            return json(res, { success: true, total_with_tax: 61 });
        }
        if (url.pathname === '/v1/business-parcel-tariff/calculate') {
            strict_1.default.equal(url.searchParams.get('product-code'), 'BP');
            return json(res, { success: true, final_amount: 152 });
        }
        if (url.pathname === '/v1/offices/limited-details') {
            strict_1.default.equal(url.searchParams.get('office-type'), 'post');
            return json(res, [{ pincode: 570001, office_name: 'Mysuru H.O' }]);
        }
        if (url.pathname === '/process-articles/9999999999') {
            strict_1.default.equal(body.articles[0].barcode_no, 'EB126023474IN');
            return json(res, { success: true, valid_articles: [{ barcode_no: 'EB126023474IN', calculated_tariff: 61 }], error_articles: [] });
        }
        if (url.pathname === '/process-articles-file/9999999999') {
            strict_1.default.match(String(req.headers['content-type']), /multipart\/form-data; boundary=/);
            strict_1.default.match(bodyText, /"articles"/);
            return json(res, { success: true, valid_articles: [{ barcode_no: 'EB126023474IN' }] });
        }
        if (url.pathname === '/v1/label/create/domestic') {
            strict_1.default.equal(body.barcode_no, 'EB126023474IN');
            res.writeHead(200, { 'Content-Type': 'application/pdf' });
            return res.end(Buffer.from('%PDF-1.4 mock'));
        }
        if (url.pathname === '/v1/event/download') {
            strict_1.default.deepEqual(body, { Cust_Id: '9999999999', Event_Code: 'LE', Event_Date: '17082026' });
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            return res.end('<LatestEventDetails />');
        }
        if (url.pathname === '/v1/tracking/bulk') {
            strict_1.default.deepEqual(body, { bulk: ['EB126023474IN'] });
            return json(res, { status_code: 200, success: true, data: [] });
        }
        res.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const file = (0, node_path_1.join)(process.cwd(), 'indiapost-contract-test.json');
    await (0, promises_1.writeFile)(file, JSON.stringify({ articles: [{ barcode_no: 'EB126023474IN' }] }));
    try {
        const { IndiaPostService, buildIndiaPostArticleFromShipment } = await Promise.resolve().then(() => __importStar(require('../models/services/couriers/indiaPost.service')));
        const api = new IndiaPostService({ apiBase: base, masterDataBase: base, username: 'uat-user', password: 'uat-pass', customerId: '9999999999', contractId: '41441234' });
        await api.login();
        await api.refreshAccessToken();
        await api.speedPostTariff({ weight: 250, sourcePincode: '400001', destinationPincode: '110001', length: 30, width: 21, height: 0.5, insuranceValue: 1000, pod: true });
        await api.businessParcelTariff({ weight: 550, sourcePincode: '141010', destinationPincode: '110057', length: 10, width: 5, height: 2, insuranceValue: 1000 });
        await api.searchPincode('570001');
        const article = buildIndiaPostArticleFromShipment({ order_number: 'ORDER-1', payment_type: 'prepaid', package_weight: 0.25, package_length: 30, package_breadth: 21, package_height: 1, indiapost_barcode_no: 'EB126023474IN', pickup: { name: 'Shipray', warehouse_name: 'Shipray Hub', address: 'Address One', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', phone: '9999999999' }, consignee: { name: 'Test Buyer', address: 'Address Two', city: 'Delhi', state: 'Delhi', pincode: '110001', phone: '8888888888' } }, api);
        await api.bookArticles([article]);
        await api.bookArticlesFile(file);
        const label = await api.generateDomesticLabel({ barcode_no: 'EB126023474IN' });
        strict_1.default.match(Buffer.from(label).toString('utf8'), /^%PDF/);
        strict_1.default.equal(await api.downloadEvents({ eventCode: 'LE', eventDate: '17082026' }), '<LatestEventDetails />');
        await api.trackBulk(['EB126023474IN']);
        strict_1.default.equal(seen.filter((entry) => entry.endsWith('/v1/access/login')).length, 1);
        strict_1.default.equal(seen.length, 10);
        console.log('India Post integration contract checks passed');
        console.log(JSON.stringify({ calls: seen }, null, 2));
    }
    finally {
        await (0, promises_1.unlink)(file).catch(() => undefined);
        await new Promise((resolve) => server.close(() => resolve()));
    }
};
main().catch((error) => {
    console.error('India Post integration contract checks failed');
    console.error(error);
    process.exit(1);
});
