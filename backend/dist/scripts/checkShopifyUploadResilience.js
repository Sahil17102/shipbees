"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const r2Client_1 = require("../config/r2Client");
const upload_service_1 = require("../models/services/upload.service");
const run = async () => {
    const originalSend = r2Client_1.r2.send.bind(r2Client_1.r2);
    let calls = 0;
    try {
        ;
        r2Client_1.r2.send = async () => {
            calls += 1;
            if (calls === 1) {
                throw Object.assign(new Error('simulated connection reset'), { code: 'ECONNRESET' });
            }
            return {};
        };
        const recovered = await (0, upload_service_1.uploadBufferToR2)({
            buffer: Buffer.from('shopify-upload-reset-test'),
            filename: 'reset-test.pdf',
            contentType: 'application/pdf',
            userId: 'shopify-review-test',
            uploadId: '00000000-0000-4000-8000-000000000001',
            folderKey: 'kyc',
        });
        strict_1.default.equal(calls, 3, 'a reset should retry one PUT and then verify the object with HEAD');
        strict_1.default.equal(recovered.key, 'kyc/shopify-review-test/00000000-0000-4000-8000-000000000001-reset-test.pdf', 'the retry must reuse the same object key');
        calls = 0;
        r2Client_1.r2.send = async () => {
            calls += 1;
            throw Object.assign(new Error('simulated access denied'), {
                name: 'AccessDenied',
                $metadata: { httpStatusCode: 403 },
            });
        };
        await strict_1.default.rejects((0, upload_service_1.uploadBufferToR2)({
            buffer: Buffer.from('shopify-upload-permanent-error-test'),
            filename: 'permanent-test.pdf',
            contentType: 'application/pdf',
            userId: 'shopify-review-test',
            uploadId: '00000000-0000-4000-8000-000000000002',
            folderKey: 'labels',
        }), /simulated access denied/);
        strict_1.default.equal(calls, 1, 'a permanent authorization error must not be retried');
        console.log('Shopify upload reset resilience check passed');
    }
    finally {
        ;
        r2Client_1.r2.send = originalSend;
    }
};
run().catch((error) => {
    console.error('Shopify upload reset resilience check failed:', error);
    process.exit(1);
});
