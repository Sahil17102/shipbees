"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCanonicalDelhiveryCourierId = exports.resolveDelhiveryRateCardShippingMode = exports.resolveDelhiveryShippingMode = exports.normalizeDelhiveryShippingMode = exports.getDelhiveryCourierDisplayName = exports.getCanonicalDelhiveryCourierIdByMode = exports.getDelhiveryShippingModeByCourierId = exports.isSupportedDelhiveryCourierId = exports.normalizeCourierId = exports.DELHIVERY_ALLOWED_COURIER_IDS = exports.DELHIVERY_B2C_COURIER_CATALOG = exports.DELHIVERY_COURIER_IDS = void 0;
exports.DELHIVERY_COURIER_IDS = {
    EXPRESS: 99,
    SURFACE: 100,
};
exports.DELHIVERY_B2C_COURIER_CATALOG = [
    {
        id: exports.DELHIVERY_COURIER_IDS.EXPRESS,
        name: 'Delhivery Air',
        serviceProvider: 'delhivery',
        mode: 'Air',
    },
    {
        id: exports.DELHIVERY_COURIER_IDS.SURFACE,
        name: 'Delhivery Surface',
        serviceProvider: 'delhivery',
        mode: 'Surface',
    },
];
const DELHIVERY_LEGACY_MODE_BY_ID = {
    // Current admin/manual setup.
    [exports.DELHIVERY_COURIER_IDS.EXPRESS]: 'Express',
    [exports.DELHIVERY_COURIER_IDS.SURFACE]: 'Surface',
    // Legacy/imported Shiprocket-style B2C rate cards commonly use id 1 for Delhivery Air.
    1: 'Express',
    92: 'Express',
    93: 'Surface',
};
exports.DELHIVERY_ALLOWED_COURIER_IDS = [
    exports.DELHIVERY_COURIER_IDS.EXPRESS,
    exports.DELHIVERY_COURIER_IDS.SURFACE,
    1,
    92,
    93,
];
const normalizeCourierId = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return Number(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
exports.normalizeCourierId = normalizeCourierId;
const isSupportedDelhiveryCourierId = (value) => {
    const id = (0, exports.normalizeCourierId)(value);
    if (id === null)
        return false;
    return exports.DELHIVERY_ALLOWED_COURIER_IDS.includes(id);
};
exports.isSupportedDelhiveryCourierId = isSupportedDelhiveryCourierId;
const getDelhiveryShippingModeByCourierId = (value) => {
    const id = (0, exports.normalizeCourierId)(value);
    return id === null ? null : DELHIVERY_LEGACY_MODE_BY_ID[id] ?? null;
};
exports.getDelhiveryShippingModeByCourierId = getDelhiveryShippingModeByCourierId;
const getCanonicalDelhiveryCourierIdByMode = (mode) => {
    if (mode === 'Express')
        return exports.DELHIVERY_COURIER_IDS.EXPRESS;
    if (mode === 'Surface')
        return exports.DELHIVERY_COURIER_IDS.SURFACE;
    return null;
};
exports.getCanonicalDelhiveryCourierIdByMode = getCanonicalDelhiveryCourierIdByMode;
const getDelhiveryCourierDisplayName = (mode) => (mode === 'Express' ? 'Delhivery Air' : 'Delhivery Surface');
exports.getDelhiveryCourierDisplayName = getDelhiveryCourierDisplayName;
const normalizeDelhiveryShippingMode = (value) => {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!normalized)
        return null;
    if (['air', 'a', 'express', 'e'].includes(normalized) || normalized.includes('air')) {
        return 'Express';
    }
    if (['surface', 's', 'ground'].includes(normalized) || normalized.includes('surface')) {
        return 'Surface';
    }
    return null;
};
exports.normalizeDelhiveryShippingMode = normalizeDelhiveryShippingMode;
const resolveDelhiveryShippingMode = ({ courierId, mode, courierName, }) => (0, exports.getDelhiveryShippingModeByCourierId)(courierId) ||
    (0, exports.normalizeDelhiveryShippingMode)(mode) ||
    (0, exports.normalizeDelhiveryShippingMode)(courierName);
exports.resolveDelhiveryShippingMode = resolveDelhiveryShippingMode;
const resolveDelhiveryRateCardShippingMode = ({ courierId, mode, courierName, }) => {
    const id = (0, exports.normalizeCourierId)(courierId);
    // Imported rate cards can contain stale/generic mode values. In those files,
    // the courier display name is the most reliable Air/Surface signal.
    if (id === 1 || id === 92)
        return 'Express';
    if (id === 93)
        return 'Surface';
    const nameMode = (0, exports.normalizeDelhiveryShippingMode)(courierName);
    if (nameMode)
        return nameMode;
    const explicitMode = (0, exports.normalizeDelhiveryShippingMode)(mode);
    if (explicitMode)
        return explicitMode;
    return (0, exports.getDelhiveryShippingModeByCourierId)(id);
};
exports.resolveDelhiveryRateCardShippingMode = resolveDelhiveryRateCardShippingMode;
const resolveCanonicalDelhiveryCourierId = (source) => (0, exports.getCanonicalDelhiveryCourierIdByMode)((0, exports.resolveDelhiveryShippingMode)(source));
exports.resolveCanonicalDelhiveryCourierId = resolveCanonicalDelhiveryCourierId;
