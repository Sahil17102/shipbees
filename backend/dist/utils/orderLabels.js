"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrderLabelReference = exports.getAmazonOrderLabelReference = exports.isExternalLabelReference = void 0;
const normalize = (value) => String(value ?? '').trim();
const parseObject = (value) => {
    if (!value)
        return {};
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return {};
        try {
            const parsed = JSON.parse(trimmed);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
const readText = (value) => {
    const text = normalize(value);
    return text ? text : null;
};
const getFirstText = (...values) => {
    for (const value of values) {
        const text = readText(value);
        if (text)
            return text;
    }
    return null;
};
const isExternalLabelReference = (value) => {
    const text = normalize(value);
    if (/^data:/i.test(text))
        return true;
    if (!/^https?:\/\//i.test(text))
        return false;
    const r2Endpoint = normalize(process.env.R2_ENDPOINT);
    const isR2Url = (r2Endpoint && text.includes(r2Endpoint)) || text.includes('.r2.cloudflarestorage.com');
    return !isR2Url;
};
exports.isExternalLabelReference = isExternalLabelReference;
const getAmazonOrderLabelReference = (order) => {
    if (!order)
        return null;
    const integrationType = normalize(order.integration_type || order.courier_partner).toLowerCase();
    if (!integrationType.includes('amazon'))
        return null;
    const providerMeta = parseObject(order.provider_meta);
    const amazonMeta = parseObject(providerMeta.amazon || providerMeta.amazonMeta);
    const packages = Array.isArray(providerMeta.packages) ? providerMeta.packages : [];
    const shipmentDocuments = Array.isArray(providerMeta.shipmentDocuments)
        ? providerMeta.shipmentDocuments
        : [];
    const packageDocumentDetails = Array.isArray(providerMeta.packageDocumentDetails)
        ? providerMeta.packageDocumentDetails
        : [];
    return getFirstText(providerMeta.amazon_label, providerMeta.amazonLabel, amazonMeta.label, amazonMeta.label_url, amazonMeta.documentUrl, amazonMeta.document_url, amazonMeta.url, packages[0]?.label, packages[0]?.labelUrl, packages[0]?.documentUrl, packages[0]?.document_url, packages[0]?.url, packageDocumentDetails[0]?.label, packageDocumentDetails[0]?.labelUrl, packageDocumentDetails[0]?.documentUrl, packageDocumentDetails[0]?.document_url, packageDocumentDetails[0]?.url, shipmentDocuments[0]?.label, shipmentDocuments[0]?.labelUrl, shipmentDocuments[0]?.documentUrl, shipmentDocuments[0]?.document_url, shipmentDocuments[0]?.url, providerMeta.label, providerMeta.label_url, providerMeta.documentUrl, providerMeta.document_url, providerMeta.url);
};
exports.getAmazonOrderLabelReference = getAmazonOrderLabelReference;
const getOrderLabelReference = (order) => normalize(order.integration_type || order.courier_partner).toLowerCase().includes('amazon')
    ? (0, exports.getAmazonOrderLabelReference)(order)
    : getFirstText(order?.label, order?.label_url);
exports.getOrderLabelReference = getOrderLabelReference;
