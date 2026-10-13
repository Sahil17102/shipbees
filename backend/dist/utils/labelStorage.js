"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVersionedLabelUploadId = void 0;
const crypto_1 = require("crypto");
const sanitizeToken = (value, fallback) => String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
const buildVersionedLabelUploadId = ({ orderId, labelIdentifier, pdfBuffer, }) => {
    const orderToken = sanitizeToken(orderId, labelIdentifier).slice(0, 42) || 'order';
    const contentVersion = (0, crypto_1.createHash)('sha256').update(pdfBuffer).digest('hex').slice(0, 24);
    return `label-${orderToken}-${contentVersion}`;
};
exports.buildVersionedLabelUploadId = buildVersionedLabelUploadId;
