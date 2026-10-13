"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER = exports.AMAZON_SHIPPING_WEBHOOK_URL = exports.AMAZON_SHIPPING_WEBHOOK_PATH = exports.AMAZON_SHIPPING_APPLICATION_ID = void 0;
exports.AMAZON_SHIPPING_APPLICATION_ID = process.env.AMAZON_SHIPPING_APPLICATION_ID ||
    'amzn1.sp.solution.f748c717-0282-414f-84e0-883ed14c385f';
exports.AMAZON_SHIPPING_WEBHOOK_PATH = '/webhooks/amazon-shipping/tracking';
exports.AMAZON_SHIPPING_WEBHOOK_URL = process.env.AMAZON_SHIPPING_WEBHOOK_URL ||
    `https://api.shipray.com${exports.AMAZON_SHIPPING_WEBHOOK_PATH}`;
exports.AMAZON_SHIPPING_WEBHOOK_API_KEY_HEADER = 'X-API-KEY';
