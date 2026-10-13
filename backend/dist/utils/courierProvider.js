"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCourierProviderKeyFromFields = exports.getProviderMetaCourierName = exports.getCourierProviderDisplayName = exports.normalizeCourierProviderKey = exports.COURIER_PROVIDER_KEYS = void 0;
exports.COURIER_PROVIDER_KEYS = [
    'delhivery',
    'shadowfax',
    'amazon',
    'xpressbees',
    'ekart',
    'indiapost',
];
const COURIER_PROVIDER_DISPLAY_NAMES = {
    delhivery: 'Delhivery',
    shadowfax: 'Shadowfax',
    amazon: 'Amazon Shipping',
    xpressbees: 'Xpressbees',
    ekart: 'Ekart Logistics',
    indiapost: 'India Post',
};
const normalizeText = (value) => String(value ?? '').trim();
const toRecord = (value) => {
    if (!value)
        return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : {};
};
const normalizeCourierProviderKey = (value) => {
    const text = normalizeText(value).toLowerCase();
    if (!text)
        return '';
    if (exports.COURIER_PROVIDER_KEYS.includes(text)) {
        return text;
    }
    const compact = text.replace(/[\s_-]+/g, '');
    if (compact.includes('delhivery'))
        return 'delhivery';
    if (compact.includes('shadowfax'))
        return 'shadowfax';
    if (compact.includes('amazon'))
        return 'amazon';
    if (compact.includes('xpressbees') || compact.includes('xpressbee'))
        return 'xpressbees';
    if (compact.includes('ekart'))
        return 'ekart';
    if (compact.includes('indiapost') || compact.includes('speedpost'))
        return 'indiapost';
    return '';
};
exports.normalizeCourierProviderKey = normalizeCourierProviderKey;
const getCourierProviderDisplayName = (providerKey) => {
    const normalized = (0, exports.normalizeCourierProviderKey)(providerKey);
    return normalized ? COURIER_PROVIDER_DISPLAY_NAMES[normalized] : '';
};
exports.getCourierProviderDisplayName = getCourierProviderDisplayName;
const getProviderMetaCourierName = (providerMeta) => {
    const meta = toRecord(providerMeta);
    const data = toRecord(meta.data);
    const provider = toRecord(meta.provider);
    const providerServiceability = toRecord(meta.provider_serviceability);
    const candidates = [
        meta.courier_name,
        meta.courierName,
        meta.carrier_name,
        meta.carrierName,
        meta.provider_name,
        data.courier_name,
        data.courierName,
        data.carrier_name,
        data.carrierName,
        provider.courier_name,
        provider.courierName,
        provider.name,
        providerServiceability.carrier_name,
        providerServiceability.carrierName,
    ];
    return candidates.map(normalizeText).find(Boolean) || '';
};
exports.getProviderMetaCourierName = getProviderMetaCourierName;
const resolveCourierProviderKeyFromFields = (...values) => {
    for (const value of values) {
        const providerKey = (0, exports.normalizeCourierProviderKey)(value);
        if (providerKey)
            return providerKey;
    }
    return '';
};
exports.resolveCourierProviderKeyFromFields = resolveCourierProviderKeyFromFields;
