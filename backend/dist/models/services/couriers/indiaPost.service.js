"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIndiaPostArticleFromShipment = exports.IndiaPostService = void 0;
const axios_1 = __importDefault(require("axios"));
const promises_1 = require("fs/promises");
const path_1 = require("path");
const classes_1 = require("../../../utils/classes");
const SANDBOX_API_BASE = 'https://test.cept.gov.in/beextcustomer';
const SANDBOX_MASTER_DATA_BASE = 'https://test.cept.gov.in/bemasterdata';
const TOKEN_EXPIRY_BUFFER_MS = 60000;
const cleanBase = (value) => value.trim().replace(/\/+$/, '');
const clean = (value) => String(value ?? '').trim();
const requirePincode = (value, field) => {
    const pincode = clean(value);
    if (!/^\d{6}$/.test(pincode))
        throw new classes_1.HttpError(400, `${field} must be exactly 6 digits`);
    return pincode;
};
const positiveNumber = (value, field) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0)
        throw new classes_1.HttpError(400, `${field} must be greater than 0`);
    return number;
};
const providerMessage = (value) => {
    if (!value)
        return '';
    if (typeof value === 'string')
        return value.trim();
    if (Array.isArray(value))
        return value.map(providerMessage).find(Boolean) || '';
    if (typeof value === 'object') {
        const row = value;
        return (providerMessage(row.message) ||
            providerMessage(row.error) ||
            providerMessage(row.errors) ||
            providerMessage(row.detail));
    }
    return clean(value);
};
class IndiaPostService {
    constructor(config = {}) {
        this.tokens = null;
        this.loginPromise = null;
        this.environment = config.environment || process.env.INDIAPOST_ENV || 'sandbox';
        const apiBase = cleanBase(config.apiBase || process.env.INDIAPOST_API_BASE || SANDBOX_API_BASE);
        const masterDataBase = cleanBase(config.masterDataBase || process.env.INDIAPOST_MASTERDATA_BASE || SANDBOX_MASTER_DATA_BASE);
        const timeout = Number(config.timeoutMs || process.env.INDIAPOST_TIMEOUT_MS || 30000);
        this.username = clean(config.username || process.env.INDIAPOST_USERNAME);
        this.password = clean(config.password || process.env.INDIAPOST_PASSWORD);
        this.customerId = clean(config.customerId || process.env.INDIAPOST_CUSTOMER_ID);
        this.contractId = clean(config.contractId || process.env.INDIAPOST_CONTRACT_ID);
        this.dropoffOfficeId = clean(config.dropoffOfficeId || process.env.INDIAPOST_DROPOFF_OFFICE_ID);
        this.api = axios_1.default.create({ baseURL: apiBase, timeout });
        this.masterDataApi = axios_1.default.create({ baseURL: masterDataBase, timeout });
    }
    assertCredentials() {
        if (!this.username || !this.password) {
            throw new classes_1.HttpError(503, 'India Post API credentials are not configured');
        }
    }
    toHttpError(error, operation) {
        const axiosError = error;
        const status = axiosError.response?.status || 502;
        const message = providerMessage(axiosError.response?.data) || axiosError.message || `${operation} failed`;
        return new classes_1.HttpError(status, `India Post ${operation} failed: ${message}`);
    }
    saveTokens(payload) {
        const data = payload?.data || payload || {};
        const accessToken = clean(data.access_token || data.accessToken);
        const refreshToken = clean(data.refresh_token || data.refreshToken || this.tokens?.refreshToken);
        if (!accessToken)
            throw new classes_1.HttpError(502, 'India Post login response did not contain an access token');
        const now = Date.now();
        this.tokens = {
            accessToken,
            refreshToken,
            accessExpiresAt: now + Math.max(Number(data.expires_in || 3600) * 1000, TOKEN_EXPIRY_BUFFER_MS),
            refreshExpiresAt: now + Math.max(Number(data.refresh_expires_in || 86400) * 1000, TOKEN_EXPIRY_BUFFER_MS),
        };
        return accessToken;
    }
    async login() {
        this.assertCredentials();
        try {
            const response = await this.api.post('/v1/access/login', {
                username: this.username,
                password: this.password,
            });
            return { accessToken: this.saveTokens(response.data), response: response.data };
        }
        catch (error) {
            throw this.toHttpError(error, 'login');
        }
    }
    async refreshAccessToken() {
        if (!this.tokens?.refreshToken)
            return this.login();
        try {
            const response = await this.api.post('/v1/access/TokenWithRtoken', undefined, {
                headers: { Authorization: `Bearer ${this.tokens.refreshToken}` },
            });
            return { accessToken: this.saveTokens(response.data), response: response.data };
        }
        catch {
            this.tokens = null;
            return this.login();
        }
    }
    async getAccessToken(forceLogin = false) {
        if (!forceLogin && this.tokens && this.tokens.accessExpiresAt - TOKEN_EXPIRY_BUFFER_MS > Date.now()) {
            return this.tokens.accessToken;
        }
        if (!forceLogin && this.tokens?.refreshToken && this.tokens.refreshExpiresAt > Date.now()) {
            return (await this.refreshAccessToken()).accessToken;
        }
        if (!this.loginPromise) {
            this.loginPromise = this.login()
                .then((result) => result.accessToken)
                .finally(() => {
                this.loginPromise = null;
            });
        }
        return this.loginPromise;
    }
    async authorizedRequest(client, config, operation, retried = false) {
        try {
            const token = await this.getAccessToken(retried);
            const response = await client.request({
                ...config,
                headers: { ...config.headers, Authorization: `Bearer ${token}` },
            });
            return response.data;
        }
        catch (error) {
            const axiosError = error;
            if (!retried && axiosError.response?.status === 401) {
                this.tokens = null;
                return this.authorizedRequest(client, config, operation, true);
            }
            if (error instanceof classes_1.HttpError)
                throw error;
            throw this.toHttpError(error, operation);
        }
    }
    speedPostTariff(input) {
        return this.authorizedRequest(this.api, {
            method: 'GET',
            url: '/v1/speed-post/tariffs',
            params: {
                'product-code': 'SP',
                weight: positiveNumber(input.weight, 'weight'),
                'source-pincode': requirePincode(input.sourcePincode, 'sourcePincode'),
                'destination-pincode': requirePincode(input.destinationPincode, 'destinationPincode'),
                length: positiveNumber(input.length, 'length'),
                width: positiveNumber(input.width, 'width'),
                height: positiveNumber(input.height, 'height'),
                ...(Number(input.insuranceValue) > 0 ? { INS: Number(input.insuranceValue) } : {}),
                ...(input.pod ? { POD: 'YES' } : {}),
            },
        }, 'Speed Post tariff lookup');
    }
    businessParcelTariff(input) {
        return this.authorizedRequest(this.api, {
            method: 'GET',
            url: '/v1/business-parcel-tariff/calculate',
            params: {
                'product-code': 'BP',
                weight: positiveNumber(input.weight, 'weight'),
                'source-pincode': requirePincode(input.sourcePincode, 'sourcePincode'),
                'destination-pincode': requirePincode(input.destinationPincode, 'destinationPincode'),
                length: positiveNumber(input.length, 'length'),
                width: positiveNumber(input.width, 'width'),
                height: positiveNumber(input.height, 'height'),
                ...(Number(input.insuranceValue) > 0 ? { ins: Number(input.insuranceValue) } : {}),
            },
        }, 'Business Parcel tariff lookup');
    }
    searchPincode(pincode, limit = 50) {
        return this.authorizedRequest(this.masterDataApi, {
            method: 'GET',
            url: '/v1/offices/limited-details',
            params: { pincode: requirePincode(pincode, 'pincode'), limit: Math.min(Math.max(limit, 1), 50), 'office-type': 'post' },
        }, 'pincode search');
    }
    async bookArticles(articles, customId = this.customerId) {
        if (!/^\d{10}$/.test(clean(customId)))
            throw new classes_1.HttpError(400, 'India Post customer ID must be 10 digits');
        if (!Array.isArray(articles) || articles.length < 1 || articles.length > 999) {
            throw new classes_1.HttpError(400, 'India Post JSON booking requires 1 to 999 articles');
        }
        return this.authorizedRequest(this.api, { method: 'POST', url: `/process-articles/${encodeURIComponent(customId)}`, data: { articles } }, 'article booking');
    }
    async bookArticlesFile(filePath, customId = this.customerId) {
        const content = await (0, promises_1.readFile)(filePath);
        return this.bookArticlesFileBuffer(content, (0, path_1.basename)(filePath), customId);
    }
    async bookArticlesFileBuffer(content, filename = 'articles.json', customId = this.customerId) {
        if (!/^\d{10}$/.test(clean(customId)))
            throw new classes_1.HttpError(400, 'India Post customer ID must be 10 digits');
        if (!content?.length)
            throw new classes_1.HttpError(400, 'India Post booking file is empty');
        try {
            const parsed = JSON.parse(content.toString('utf8'));
            if (!Array.isArray(parsed?.articles) || parsed.articles.length < 1 || parsed.articles.length > 5000) {
                throw new Error('articles must contain 1 to 5000 items');
            }
        }
        catch (error) {
            throw new classes_1.HttpError(400, `Invalid India Post booking JSON file: ${error?.message || error}`);
        }
        const boundary = `----ShiprayIndiaPost${Date.now().toString(16)}`;
        const head = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${(0, path_1.basename)(filename)}"\r\nContent-Type: application/json\r\n\r\n`);
        const body = Buffer.concat([head, content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
        return this.authorizedRequest(this.api, {
            method: 'POST',
            url: `/process-articles-file/${encodeURIComponent(customId)}`,
            data: body,
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
            maxBodyLength: Infinity,
        }, 'article file booking');
    }
    generateDomesticLabel(payload) {
        if (!clean(payload.barcode_no))
            throw new classes_1.HttpError(400, 'barcode_no is required for India Post labels');
        return this.authorizedRequest(this.api, { method: 'POST', url: '/v1/label/create/domestic', data: payload, responseType: 'arraybuffer' }, 'domestic label generation');
    }
    downloadEvents(input) {
        const customerId = clean(input.customerId || this.customerId);
        if (!/^\d{10}$/.test(customerId))
            throw new classes_1.HttpError(400, 'India Post customer ID must be 10 digits');
        if (!/^(LE|IB|ID|RT)$/.test(input.eventCode))
            throw new classes_1.HttpError(400, 'Invalid India Post event code');
        if (!/^\d{8}$/.test(input.eventDate))
            throw new classes_1.HttpError(400, 'eventDate must use DDMMYYYY format');
        return this.authorizedRequest(this.api, {
            method: 'POST',
            url: '/v1/event/download',
            data: { Cust_Id: customerId, Event_Code: input.eventCode, Event_Date: input.eventDate },
            responseType: 'text',
        }, 'event download');
    }
    trackBulk(articleNumbers) {
        const bulk = Array.from(new Set(articleNumbers.map(clean).filter(Boolean)));
        if (bulk.length < 1 || bulk.length > 50)
            throw new classes_1.HttpError(400, 'India Post tracking accepts 1 to 50 articles');
        return this.authorizedRequest(this.api, { method: 'POST', url: '/v1/tracking/bulk', data: { bulk } }, 'bulk tracking');
    }
}
exports.IndiaPostService = IndiaPostService;
const buildIndiaPostArticleFromShipment = (params, config) => {
    if (!/^\d{10}$/.test(config.customerId))
        throw new classes_1.HttpError(503, 'INDIAPOST_CUSTOMER_ID must be configured');
    if (!/^\d{8}$/.test(config.contractId))
        throw new classes_1.HttpError(503, 'INDIAPOST_CONTRACT_ID must be configured');
    const weightKg = Number(params.package_weight ?? params.weight);
    const weightGrams = Math.round(weightKg > 35 ? weightKg : weightKg * 1000);
    const paymentType = clean(params.payment_type).toLowerCase();
    const codAmount = paymentType === 'cod' ? Number(params.cod_amount ?? params.order_amount ?? 0) : 0;
    const barcode = clean(params.indiapost_barcode_no || params.barcode_no);
    if (!barcode)
        throw new classes_1.HttpError(400, 'India Post barcode is required for booking');
    const sender = params.pickup || {};
    const receiver = params.consignee || {};
    return {
        bulk_customer_id: config.customerId,
        contract_id: config.contractId,
        barcode_no: barcode,
        pickup_or_dropoff: 'DROPOFF',
        pickup_dropoff_office_id: config.dropoffOfficeId ? Number(config.dropoffOfficeId) : undefined,
        article_type: clean(params.indiapost_article_type || params.article_type).toUpperCase() === 'BP' ? 'BP' : 'SP',
        physical_weight: positiveNumber(weightGrams, 'physical_weight'),
        shape_of_article: 'NROL',
        length: positiveNumber(params.package_length ?? params.length, 'length'),
        breadth_diameter: positiveNumber(params.package_breadth ?? params.breadth, 'breadth'),
        height: positiveNumber(params.package_height ?? params.height, 'height'),
        sender_name: clean(sender.name || sender.warehouse_name).slice(0, 80),
        sender_company: clean(sender.warehouse_name || params.company?.name || sender.name).slice(0, 80),
        sender_add_line_1: clean(sender.address).slice(0, 80),
        sender_add_line_2: clean(sender.address_2).slice(0, 80),
        sender_city: clean(sender.city).slice(0, 80),
        sender_state: clean(sender.state).slice(0, 80),
        sender_pincode: requirePincode(sender.pincode, 'sender_pincode'),
        sender_mobile_no: clean(sender.phone),
        receiver_name: clean(receiver.name).slice(0, 80),
        receiver_company: clean(receiver.company_name || receiver.name).slice(0, 80),
        receiver_add_line_1: clean(receiver.address || receiver.address_line_1).slice(0, 80),
        receiver_add_line_2: clean(receiver.address_2 || receiver.address_line_2).slice(0, 80),
        receiver_city: clean(receiver.city).slice(0, 80),
        receiver_state: clean(receiver.state).slice(0, 80),
        receiver_pincode: requirePincode(receiver.pincode, 'receiver_pincode'),
        receiver_mobile_no: clean(receiver.phone),
        alt_address_flag: false,
        pickup_address_flag: false,
        drop_off_pincode: requirePincode(sender.pincode, 'drop_off_pincode'),
        codr_cod: codAmount > 0 ? 'COD' : 'CODR',
        value_for_codr_cod: codAmount,
        ack: false,
        reg: false,
        otp: false,
        bulk_reference: clean(params.order_number).slice(0, 50),
    };
};
exports.buildIndiaPostArticleFromShipment = buildIndiaPostArticleFromShipment;
