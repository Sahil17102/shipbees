"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RazorpayConfigurationError = void 0;
exports.isRazorpayConfigured = isRazorpayConfigured;
exports.getRazorpay = getRazorpay;
exports.getRazorpayApi = getRazorpayApi;
exports.getRazorpayKeyId = getRazorpayKeyId;
exports.isValidSig = isValidSig;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const razorpay_1 = __importDefault(require("razorpay"));
class RazorpayConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.code = 'RAZORPAY_NOT_CONFIGURED';
        this.statusCode = 503;
        this.name = 'RazorpayConfigurationError';
    }
}
exports.RazorpayConfigurationError = RazorpayConfigurationError;
let razorpayClient;
let razorpayAxiosClient;
function getMode() {
    const configuredMode = process.env.RAZORPAY_MODE?.trim().toLowerCase();
    if (configuredMode && configuredMode !== 'test' && configuredMode !== 'live') {
        throw new RazorpayConfigurationError('RAZORPAY_MODE must be either "test" or "live".');
    }
    if (configuredMode)
        return configuredMode;
    return process.env.NODE_ENV === 'production' ? 'live' : 'test';
}
function readCredentials() {
    const mode = getMode();
    const keyId = mode === 'live'
        ? process.env.RAZORPAY_KEY_ID_PROD || process.env.RAZORPAY_KEY_ID
        : process.env.RAZORPAY_KEY_ID;
    const keySecret = mode === 'live'
        ? process.env.RAZORPAY_KEY_SECRET_PROD || process.env.RAZORPAY_KEY_SECRET
        : process.env.RAZORPAY_KEY_SECRET;
    if (!keyId?.trim() || !keySecret?.trim()) {
        const expected = mode === 'live'
            ? 'RAZORPAY_KEY_ID_PROD and RAZORPAY_KEY_SECRET_PROD (or RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)'
            : 'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET';
        throw new RazorpayConfigurationError(`Razorpay ${mode.toUpperCase()} credentials are not configured. Set ${expected}.`);
    }
    return {
        key_id: keyId.trim(),
        key_secret: keySecret.trim(),
    };
}
function readWebhookSecret() {
    const mode = getMode();
    const secret = mode === 'live'
        ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD || process.env.RAZORPAY_WEBHOOK_SECRET
        : process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret?.trim()) {
        throw new RazorpayConfigurationError(`Razorpay ${mode.toUpperCase()} webhook secret is not configured.`);
    }
    return secret.trim();
}
function isRazorpayConfigured() {
    try {
        readCredentials();
        return true;
    }
    catch (error) {
        if (error instanceof RazorpayConfigurationError)
            return false;
        throw error;
    }
}
function getRazorpay() {
    if (!razorpayClient) {
        const credentials = readCredentials();
        razorpayClient = new razorpay_1.default(credentials);
        console.info(`[Razorpay] Initialised in ${getMode().toUpperCase()} mode`);
    }
    return razorpayClient;
}
function getRazorpayApi() {
    if (!razorpayAxiosClient) {
        const credentials = readCredentials();
        razorpayAxiosClient = axios_1.default.create({
            baseURL: 'https://api.razorpay.com/v1',
            auth: {
                username: credentials.key_id,
                password: credentials.key_secret,
            },
        });
    }
    return razorpayAxiosClient;
}
function getRazorpayKeyId() {
    return readCredentials().key_id;
}
function isValidSig(body, signature) {
    if (!signature)
        return false;
    const expected = crypto_1.default
        .createHmac('sha256', readWebhookSecret())
        .update(body)
        .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    return (expectedBuffer.length === signatureBuffer.length &&
        crypto_1.default.timingSafeEqual(expectedBuffer, signatureBuffer));
}
