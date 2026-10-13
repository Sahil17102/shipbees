"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const labelStorage_1 = require("../utils/labelStorage");
const orderId = 'order-123';
const originalPdf = Buffer.from('label with original delivery address');
const updatedPdf = Buffer.from('label with updated delivery address');
const originalKey = (0, labelStorage_1.buildVersionedLabelUploadId)({
    orderId,
    labelIdentifier: '10001',
    pdfBuffer: originalPdf,
});
const retryKey = (0, labelStorage_1.buildVersionedLabelUploadId)({
    orderId,
    labelIdentifier: '10001',
    pdfBuffer: originalPdf,
});
const updatedKey = (0, labelStorage_1.buildVersionedLabelUploadId)({
    orderId,
    labelIdentifier: '10001',
    pdfBuffer: updatedPdf,
});
assert_1.default.strictEqual(retryKey, originalKey, 'An identical upload retry must remain idempotent');
assert_1.default.notStrictEqual(updatedKey, originalKey, 'A changed label must receive a new immutable storage reference');
assert_1.default.match(originalKey, /^label-[A-Za-z0-9_-]+-[a-f0-9]{24}$/);
assert_1.default.match(updatedKey, /^label-[A-Za-z0-9_-]+-[a-f0-9]{24}$/);
console.log('Label regeneration storage check passed', {
    identicalRetryIsStable: retryKey === originalKey,
    changedLabelGetsNewReference: updatedKey !== originalKey,
});
