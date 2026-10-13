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
Object.defineProperty(exports, "__esModule", { value: true });
exports.markManualShipmentCancelled = exports.attachProviderAwbForReconciliation = exports.markManualShipmentActionRequired = exports.releaseProviderBookingAttempt = exports.failProviderBookingAttempt = exports.completeProviderBookingAttempt = exports.startProviderBookingAttempt = exports.getProviderOptionsForManualShipment = exports.addManualTrackingEvent = exports.setManualFulfilmentMode = exports.getManualShipmentStats = exports.getManualShipmentAdminDetail = exports.listManualShipmentsForAdmin = exports.resolveLocalAwbForProviderAwb = exports.getManualTrackingProviderData = exports.resolveManualTrackingContext = exports.createManualB2BShipment = exports.recordManualB2CShipment = exports.prepareManualB2CBooking = exports.getManualB2BRateOptions = exports.getManualB2CRateOptions = exports.removeManualCourierPincode = exports.appendManualCourierPincodes = exports.replaceManualCourierPincodes = exports.updateManualCourier = exports.createManualCourier = exports.getManualCourier = exports.listManualCouriers = void 0;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const couriers_1 = require("../schema/couriers");
const manualCouriers_1 = require("../schema/manualCouriers");
const trackingEvents_1 = require("../schema/trackingEvents");
const users_1 = require("../schema/users");
const wallet_1 = require("../schema/wallet");
const classes_1 = require("../../utils/classes");
const b2bAdmin_service_1 = require("./b2bAdmin.service");
const generateCustomLabelService_1 = require("./generateCustomLabelService");
const upload_service_1 = require("./upload.service");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const MANUAL_PROVIDER = 'manual';
const TERMINAL_SHIPMENT_STATUSES = new Set(['cancelled', 'delivered', 'rto_delivered']);
const SUPPORTED_PROVIDER_REBOOKS = new Set([
    'delhivery',
    'ekart',
    'xpressbees',
    'shadowfax',
    'amazon',
]);
const normalizeText = (value) => String(value ?? '').trim();
const normalizeCode = (value) => normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
const normalizePincode = (value) => normalizeText(value).replace(/\D/g, '').slice(0, 6);
const normalizeProvider = (value) => normalizeText(value).toLowerCase();
const normalizeRovType = (value) => {
    const normalized = normalizeText(value).toLowerCase();
    return ['courier', 'owner', 'carrier', 'none'].includes(normalized)
        ? normalized
        : 'owner';
};
const toFiniteNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeWeightKg = (value) => {
    const numeric = toFiniteNumber(value);
    if (numeric <= 0)
        return 0;
    return numeric > 50 ? numeric / 1000 : numeric;
};
const toDate = (value, fallback = new Date()) => {
    const parsed = value instanceof Date ? value : new Date(String(value || ''));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
const parseJsonObject = (value) => {
    if (!value)
        return {};
    if (typeof value === 'object' && !Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
};
const validatePincodes = (values) => Array.from(new Set(values
    .map(normalizePincode)
    .filter((pincode) => /^\d{6}$/.test(pincode))));
const validateManualCourierInput = (input, partial = false) => {
    const code = input.code === undefined && partial ? undefined : normalizeCode(input.code);
    const displayName = input.displayName === undefined && partial ? undefined : normalizeText(input.displayName);
    const minWeightKg = input.minWeightKg === undefined && partial ? undefined : toFiniteNumber(input.minWeightKg, 0.001);
    const maxWeightKg = input.maxWeightKg === undefined && partial ? undefined : toFiniteNumber(input.maxWeightKg);
    if (!partial || code !== undefined) {
        if (!code || code.length < 2)
            throw new classes_1.HttpError(400, 'Courier code is required');
    }
    if (!partial || displayName !== undefined) {
        if (!displayName || displayName.length < 2) {
            throw new classes_1.HttpError(400, 'Courier display name is required');
        }
    }
    if (!partial || maxWeightKg !== undefined) {
        if (!maxWeightKg || maxWeightKg <= 0) {
            throw new classes_1.HttpError(400, 'Maximum weight must be greater than 0 kg');
        }
    }
    if (minWeightKg !== undefined &&
        maxWeightKg !== undefined &&
        (minWeightKg <= 0 || minWeightKg > maxWeightKg)) {
        throw new classes_1.HttpError(400, 'Minimum weight must be positive and not exceed maximum weight');
    }
    const supportsB2c = input.supportsB2c === undefined ? undefined : Boolean(input.supportsB2c);
    const supportsB2b = input.supportsB2b === undefined ? undefined : Boolean(input.supportsB2b);
    const supportsPrepaid = input.supportsPrepaid === undefined ? undefined : Boolean(input.supportsPrepaid);
    const supportsCod = input.supportsCod === undefined ? undefined : Boolean(input.supportsCod);
    if (!partial &&
        supportsB2c === false &&
        supportsB2b === false) {
        throw new classes_1.HttpError(400, 'Enable B2C, B2B, or both');
    }
    if (!partial &&
        supportsPrepaid === false &&
        supportsCod === false) {
        throw new classes_1.HttpError(400, 'Enable prepaid, COD, or both');
    }
    return {
        code,
        displayName,
        minWeightKg,
        maxWeightKg,
        supportsB2c,
        supportsB2b,
        supportsPrepaid,
        supportsCod,
        isEnabled: input.isEnabled === undefined ? undefined : Boolean(input.isEnabled),
    };
};
const listManualCouriers = async () => {
    const rows = await client_1.db
        .select({
        id: manualCouriers_1.manualCouriers.id,
        courierId: manualCouriers_1.manualCouriers.courierId,
        code: manualCouriers_1.manualCouriers.code,
        displayName: manualCouriers_1.manualCouriers.displayName,
        supportsB2c: manualCouriers_1.manualCouriers.supportsB2c,
        supportsB2b: manualCouriers_1.manualCouriers.supportsB2b,
        supportsPrepaid: manualCouriers_1.manualCouriers.supportsPrepaid,
        supportsCod: manualCouriers_1.manualCouriers.supportsCod,
        minWeightKg: manualCouriers_1.manualCouriers.minWeightKg,
        maxWeightKg: manualCouriers_1.manualCouriers.maxWeightKg,
        isEnabled: manualCouriers_1.manualCouriers.isEnabled,
        createdAt: manualCouriers_1.manualCouriers.createdAt,
        updatedAt: manualCouriers_1.manualCouriers.updatedAt,
        pincodeCount: (0, drizzle_orm_1.sql) `count(distinct ${manualCouriers_1.manualCourierPincodes.pincode})::int`,
        shipmentCount: (0, drizzle_orm_1.sql) `count(distinct ${manualCouriers_1.manualShipments.id})::int`,
    })
        .from(manualCouriers_1.manualCouriers)
        .leftJoin(manualCouriers_1.manualCourierPincodes, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, manualCouriers_1.manualCouriers.id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.isEnabled, true)))
        .leftJoin(manualCouriers_1.manualShipments, (0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.manualCourierId, manualCouriers_1.manualCouriers.id))
        .groupBy(manualCouriers_1.manualCouriers.id)
        .orderBy((0, drizzle_orm_1.asc)(manualCouriers_1.manualCouriers.displayName));
    return rows.map((row) => ({
        ...row,
        minWeightKg: Number(row.minWeightKg),
        maxWeightKg: Number(row.maxWeightKg),
        pincodeCount: Number(row.pincodeCount || 0),
        shipmentCount: Number(row.shipmentCount || 0),
    }));
};
exports.listManualCouriers = listManualCouriers;
const getManualCourier = async (id, options = {}) => {
    const [courier] = await client_1.db
        .select()
        .from(manualCouriers_1.manualCouriers)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.id, id))
        .limit(1);
    if (!courier)
        throw new classes_1.HttpError(404, 'Manual courier not found');
    const pincodePage = Math.max(1, Number(options.pincodePage || 1));
    const pincodeLimit = Math.min(500, Math.max(1, Number(options.pincodeLimit || 100)));
    const pincodeSearch = normalizePincode(options.pincodeSearch);
    const pincodeWhere = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, id), pincodeSearch ? (0, drizzle_orm_1.ilike)(manualCouriers_1.manualCourierPincodes.pincode, `${pincodeSearch}%`) : undefined);
    const [pincodes, pincodeCountRows] = await Promise.all([
        client_1.db
            .select({
            id: manualCouriers_1.manualCourierPincodes.id,
            pincode: manualCouriers_1.manualCourierPincodes.pincode,
            isEnabled: manualCouriers_1.manualCourierPincodes.isEnabled,
        })
            .from(manualCouriers_1.manualCourierPincodes)
            .where(pincodeWhere)
            .orderBy((0, drizzle_orm_1.asc)(manualCouriers_1.manualCourierPincodes.pincode))
            .limit(pincodeLimit)
            .offset((pincodePage - 1) * pincodeLimit),
        client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(manualCouriers_1.manualCourierPincodes)
            .where(pincodeWhere),
    ]);
    const pincodeTotal = Number(pincodeCountRows[0]?.count || 0);
    return {
        ...courier,
        minWeightKg: Number(courier.minWeightKg),
        maxWeightKg: Number(courier.maxWeightKg),
        pincodes,
        pincodePage,
        pincodeLimit,
        pincodeTotal,
        pincodeTotalPages: Math.ceil(pincodeTotal / pincodeLimit),
    };
};
exports.getManualCourier = getManualCourier;
const createManualCourier = async (input, adminUserId) => {
    const values = validateManualCourierInput(input);
    const pincodes = validatePincodes(Array.isArray(input.pincodes) ? input.pincodes : []);
    return client_1.db.transaction(async (tx) => {
        await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext('shipray_manual_courier_id'))`);
        const nextIdResult = await tx.execute((0, drizzle_orm_1.sql) `select greatest(coalesce(max(${couriers_1.couriers.id}), 0) + 1, 900001) as next_id from ${couriers_1.couriers}`);
        const nextIdRow = nextIdResult?.rows?.[0] ?? nextIdResult?.[0];
        const courierId = Number(nextIdRow?.next_id);
        if (!Number.isFinite(courierId)) {
            throw new classes_1.HttpError(500, 'Unable to allocate courier ID');
        }
        const businessType = [];
        if (values.supportsB2c !== false)
            businessType.push('b2c');
        if (values.supportsB2b === true)
            businessType.push('b2b');
        await tx.insert(couriers_1.couriers).values({
            id: courierId,
            name: values.displayName,
            serviceProvider: MANUAL_PROVIDER,
            isEnabled: values.isEnabled ?? true,
            businessType,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        const [created] = await tx
            .insert(manualCouriers_1.manualCouriers)
            .values({
            courierId,
            code: values.code,
            displayName: values.displayName,
            supportsB2c: values.supportsB2c ?? true,
            supportsB2b: values.supportsB2b ?? false,
            supportsPrepaid: values.supportsPrepaid ?? true,
            supportsCod: values.supportsCod ?? true,
            minWeightKg: values.minWeightKg ?? 0.001,
            maxWeightKg: values.maxWeightKg,
            isEnabled: values.isEnabled ?? true,
            createdBy: adminUserId,
            updatedBy: adminUserId,
        })
            .returning();
        if (pincodes.length) {
            await tx.insert(manualCouriers_1.manualCourierPincodes).values(pincodes.map((pincode) => ({
                manualCourierId: created.id,
                pincode,
                isEnabled: true,
            })));
        }
        return created;
    });
};
exports.createManualCourier = createManualCourier;
const updateManualCourier = async (id, input, adminUserId) => {
    const current = await (0, exports.getManualCourier)(id);
    const values = validateManualCourierInput(input, true);
    const supportsB2c = values.supportsB2c ?? current.supportsB2c;
    const supportsB2b = values.supportsB2b ?? current.supportsB2b;
    const supportsPrepaid = values.supportsPrepaid ?? current.supportsPrepaid;
    const supportsCod = values.supportsCod ?? current.supportsCod;
    const minWeightKg = values.minWeightKg ?? Number(current.minWeightKg);
    const maxWeightKg = values.maxWeightKg ?? Number(current.maxWeightKg);
    if (!supportsB2c && !supportsB2b)
        throw new classes_1.HttpError(400, 'Enable B2C, B2B, or both');
    if (!supportsPrepaid && !supportsCod)
        throw new classes_1.HttpError(400, 'Enable prepaid, COD, or both');
    if (minWeightKg <= 0 || minWeightKg > maxWeightKg) {
        throw new classes_1.HttpError(400, 'Minimum weight must be positive and not exceed maximum weight');
    }
    return client_1.db.transaction(async (tx) => {
        const [updated] = await tx
            .update(manualCouriers_1.manualCouriers)
            .set({
            ...(values.code !== undefined ? { code: values.code } : {}),
            ...(values.displayName !== undefined ? { displayName: values.displayName } : {}),
            supportsB2c,
            supportsB2b,
            supportsPrepaid,
            supportsCod,
            minWeightKg,
            maxWeightKg,
            ...(values.isEnabled !== undefined ? { isEnabled: values.isEnabled } : {}),
            updatedBy: adminUserId,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.id, id))
            .returning();
        const businessType = [];
        if (supportsB2c)
            businessType.push('b2c');
        if (supportsB2b)
            businessType.push('b2b');
        await tx
            .update(couriers_1.couriers)
            .set({
            name: values.displayName ?? current.displayName,
            businessType,
            isEnabled: values.isEnabled ?? current.isEnabled,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, current.courierId), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, MANUAL_PROVIDER)));
        return updated;
    });
};
exports.updateManualCourier = updateManualCourier;
const replaceManualCourierPincodes = async (id, values) => {
    await (0, exports.getManualCourier)(id);
    const pincodes = validatePincodes(values);
    if (!pincodes.length)
        throw new classes_1.HttpError(400, 'Add at least one valid 6-digit pincode');
    await client_1.db.transaction(async (tx) => {
        await tx.delete(manualCouriers_1.manualCourierPincodes).where((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, id));
        for (let index = 0; index < pincodes.length; index += 1000) {
            await tx.insert(manualCouriers_1.manualCourierPincodes).values(pincodes.slice(index, index + 1000).map((pincode) => ({
                manualCourierId: id,
                pincode,
                isEnabled: true,
            })));
        }
    });
    return { count: pincodes.length };
};
exports.replaceManualCourierPincodes = replaceManualCourierPincodes;
const appendManualCourierPincodes = async (id, values) => {
    await (0, exports.getManualCourier)(id);
    const pincodes = validatePincodes(values);
    if (!pincodes.length)
        throw new classes_1.HttpError(400, 'No valid 6-digit pincodes were found');
    for (let index = 0; index < pincodes.length; index += 1000) {
        await client_1.db
            .insert(manualCouriers_1.manualCourierPincodes)
            .values(pincodes.slice(index, index + 1000).map((pincode) => ({
            manualCourierId: id,
            pincode,
            isEnabled: true,
        })))
            .onConflictDoUpdate({
            target: [manualCouriers_1.manualCourierPincodes.manualCourierId, manualCouriers_1.manualCourierPincodes.pincode],
            set: { isEnabled: true, updatedAt: new Date() },
        });
    }
    return { count: pincodes.length };
};
exports.appendManualCourierPincodes = appendManualCourierPincodes;
const removeManualCourierPincode = async (id, pincode) => {
    const normalized = normalizePincode(pincode);
    await client_1.db
        .delete(manualCouriers_1.manualCourierPincodes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.pincode, normalized)));
};
exports.removeManualCourierPincode = removeManualCourierPincode;
const findServiceableManualCouriers = async (params) => {
    const origin = normalizePincode(params.origin);
    const destination = normalizePincode(params.destination);
    if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination))
        return [];
    const weightKg = normalizeWeightKg(params.weight);
    if (weightKg <= 0)
        return [];
    const paymentType = normalizeText(params.paymentType).toLowerCase();
    const requiredPincodeCount = origin === destination ? 1 : 2;
    const rows = await client_1.db
        .select({
        id: manualCouriers_1.manualCouriers.id,
        courierId: manualCouriers_1.manualCouriers.courierId,
        code: manualCouriers_1.manualCouriers.code,
        displayName: manualCouriers_1.manualCouriers.displayName,
        supportsPrepaid: manualCouriers_1.manualCouriers.supportsPrepaid,
        supportsCod: manualCouriers_1.manualCouriers.supportsCod,
        minWeightKg: manualCouriers_1.manualCouriers.minWeightKg,
        maxWeightKg: manualCouriers_1.manualCouriers.maxWeightKg,
        matchedPincodes: (0, drizzle_orm_1.sql) `count(distinct ${manualCouriers_1.manualCourierPincodes.pincode})::int`,
    })
        .from(manualCouriers_1.manualCouriers)
        .innerJoin(manualCouriers_1.manualCourierPincodes, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, manualCouriers_1.manualCouriers.id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.isEnabled, true), (0, drizzle_orm_1.inArray)(manualCouriers_1.manualCourierPincodes.pincode, [origin, destination])))
        .innerJoin(couriers_1.couriers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, manualCouriers_1.manualCouriers.courierId), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, MANUAL_PROVIDER), (0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true)))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.isEnabled, true), params.businessType === 'b2c'
        ? (0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.supportsB2c, true)
        : (0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.supportsB2b, true)))
        .groupBy(manualCouriers_1.manualCouriers.id);
    return rows.filter((row) => {
        if (Number(row.matchedPincodes) !== requiredPincodeCount)
            return false;
        if (paymentType === 'cod' && !row.supportsCod)
            return false;
        if (paymentType !== 'cod' && paymentType !== 'reverse' && !row.supportsPrepaid)
            return false;
        return weightKg >= Number(row.minWeightKg) && weightKg <= Number(row.maxWeightKg);
    });
};
const getManualB2CRateOptions = async (params, userId) => {
    const candidates = await findServiceableManualCouriers({
        origin: params.origin,
        destination: params.destination,
        paymentType: params.payment_type,
        weight: params.weight,
        businessType: 'b2c',
    });
    if (!candidates.length)
        return [];
    const { computeB2CFreightForOrder } = await Promise.resolve().then(() => __importStar(require('./shiprocket.service')));
    const isCod = normalizeText(params.payment_type).toLowerCase() === 'cod';
    const results = await Promise.all(candidates.map(async (candidate) => {
        try {
            const rate = await computeB2CFreightForOrder({
                userId,
                courierId: candidate.courierId,
                serviceProvider: MANUAL_PROVIDER,
                originPincode: normalizePincode(params.origin),
                destinationPincode: normalizePincode(params.destination),
                weightG: Math.round(normalizeWeightKg(params.weight) * 1000),
                lengthCm: toFiniteNumber(params.length),
                breadthCm: toFiniteNumber(params.breadth),
                heightCm: toFiniteNumber(params.height),
                orderAmount: toFiniteNumber(params.order_amount),
                isReverse: params.isReverse === true || params.payment_type === 'reverse',
            });
            const freight = Number(rate.freight || 0);
            const codCharges = isCod ? Number(rate.cod_charges || 0) : 0;
            const otherCharges = Number(rate.other_charges || 0);
            if (freight <= 0)
                return null;
            return {
                id: candidate.courierId,
                courier_id: candidate.courierId,
                name: candidate.displayName,
                displayName: candidate.displayName,
                courier_option_key: `${candidate.courierId}__shipray__base`,
                integration_type: 'shipray',
                serviceProvider: 'shipray',
                cod: candidate.supportsCod,
                prepaid: candidate.supportsPrepaid,
                booking_available: true,
                can_book: true,
                localRates: {
                    forward: {
                        rate: freight,
                        cod_charges: codCharges,
                        cod_percent: Number(rate.cod_percent || 0),
                        other_charges: otherCharges,
                        zone_id: rate.zone_id,
                        mode: null,
                        chargeable_weight: rate.chargeable_weight,
                        volumetric_weight: rate.volumetric_weight,
                        slabs: rate.slabs,
                        selected_slab: rate.selected_slab,
                    },
                },
                approxZone: { id: rate.zone_id },
                zone_id: rate.zone_id,
                courier_cost_estimate: freight + codCharges + otherCharges,
                freight_charges: freight,
                cod_charges: codCharges,
                other_charges: otherCharges,
                total_charges: freight + codCharges + otherCharges,
                rate: freight,
                chargeable_weight: rate.chargeable_weight,
                volumetric_weight: rate.volumetric_weight,
                slabs: rate.slabs,
                provider_serviceability: { serviceable: true },
            };
        }
        catch (error) {
            console.warn('[ManualCourier] Rate card unavailable', {
                courier_id: candidate.courierId,
                message: error?.message || error,
            });
            return null;
        }
    }));
    return results.filter(Boolean);
};
exports.getManualB2CRateOptions = getManualB2CRateOptions;
const getManualB2BRateOptions = async (params, userId) => {
    const candidates = await findServiceableManualCouriers({
        origin: params.origin,
        destination: params.destination,
        paymentType: params.payment_type,
        weight: params.weight,
        businessType: 'b2b',
    });
    if (!candidates.length)
        return [];
    const results = await Promise.all(candidates.map(async (candidate) => {
        try {
            const rate = await (0, b2bAdmin_service_1.calculateB2BRate)({
                originPincode: normalizePincode(params.origin),
                destinationPincode: normalizePincode(params.destination),
                weightKg: normalizeWeightKg(params.weight),
                length: toFiniteNumber(params.length) || undefined,
                width: toFiniteNumber(params.breadth) || undefined,
                height: toFiniteNumber(params.height) || undefined,
                invoiceValue: toFiniteNumber(params.order_amount),
                paymentMode: normalizeText(params.payment_type).toLowerCase() === 'cod' ? 'COD' : 'PREPAID',
                freightMode: 'fod',
                rovType: normalizeRovType(params.rov_type),
                courierScope: {
                    courierId: candidate.courierId,
                    serviceProvider: MANUAL_PROVIDER,
                },
            });
            const freight = Number(rate?.charges?.total || 0);
            if (freight <= 0)
                return null;
            return {
                id: candidate.courierId,
                courier_id: candidate.courierId,
                name: candidate.displayName,
                displayName: candidate.displayName,
                integration_type: 'shipray',
                serviceProvider: 'shipray',
                cod: candidate.supportsCod,
                prepaid: candidate.supportsPrepaid,
                booking_available: true,
                can_book: true,
                rate: freight,
                freight_charges: freight,
                total_charges: freight,
                localRates: { forward: { rate: freight, total_charges: freight } },
                charges_breakdown: rate.charges,
                provider_serviceability: { serviceable: true },
            };
        }
        catch (error) {
            console.warn('[ManualCourier] B2B rate unavailable', {
                courier_id: candidate.courierId,
                message: error?.message || error,
            });
            return null;
        }
    }));
    return results.filter(Boolean);
};
exports.getManualB2BRateOptions = getManualB2BRateOptions;
const loadBookableManualCourier = async (params, businessType) => {
    const courierId = Number(params.courier_id);
    if (!courierId)
        throw new classes_1.HttpError(400, 'Courier ID is required');
    const [courier] = await client_1.db
        .select()
        .from(manualCouriers_1.manualCouriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.courierId, courierId), (0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.isEnabled, true)))
        .limit(1);
    if (!courier)
        throw new classes_1.HttpError(400, 'Selected courier is unavailable');
    if (businessType === 'b2c' && !courier.supportsB2c) {
        throw new classes_1.HttpError(400, 'Selected courier does not support B2C shipments');
    }
    if (businessType === 'b2b' && !courier.supportsB2b) {
        throw new classes_1.HttpError(400, 'Selected courier does not support B2B shipments');
    }
    const paymentType = normalizeText(params.payment_type).toLowerCase();
    if (paymentType === 'cod' && !courier.supportsCod) {
        throw new classes_1.HttpError(400, 'Selected courier does not support COD shipments');
    }
    if (paymentType !== 'cod' && paymentType !== 'reverse' && !courier.supportsPrepaid) {
        throw new classes_1.HttpError(400, 'Selected courier does not support prepaid shipments');
    }
    const weightKg = normalizeWeightKg(params.package_weight ??
        params.weight ??
        (Array.isArray(params.boxes)
            ? params.boxes.reduce((sum, box) => sum + toFiniteNumber(box?.weight) * Math.max(1, toFiniteNumber(box?.quantity, 1)), 0)
            : 0));
    if (weightKg < Number(courier.minWeightKg) || weightKg > Number(courier.maxWeightKg)) {
        throw new classes_1.HttpError(400, `Shipment weight must be between ${Number(courier.minWeightKg)} kg and ${Number(courier.maxWeightKg)} kg for ${courier.displayName}`);
    }
    const pickupPincode = normalizePincode(params.origin || params.pickup?.pincode || params.pickup_details?.pincode);
    const destinationPincode = normalizePincode(params.destination || params.consignee?.pincode);
    const required = Array.from(new Set([pickupPincode, destinationPincode]));
    if (required.some((pincode) => !/^\d{6}$/.test(pincode))) {
        throw new classes_1.HttpError(400, 'Valid pickup and destination pincodes are required');
    }
    const coverage = await client_1.db
        .select({ pincode: manualCouriers_1.manualCourierPincodes.pincode })
        .from(manualCouriers_1.manualCourierPincodes)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.manualCourierId, courier.id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualCourierPincodes.isEnabled, true), (0, drizzle_orm_1.inArray)(manualCouriers_1.manualCourierPincodes.pincode, required)));
    const covered = new Set(coverage.map((row) => row.pincode));
    const missing = required.filter((pincode) => !covered.has(pincode));
    if (missing.length) {
        throw new classes_1.HttpError(400, `${courier.displayName} is not serviceable for this route`);
    }
    return courier;
};
const generateLocalAwb = () => {
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const suffix = (0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 14).toUpperCase();
    return `SRY${date}${suffix}`;
};
const prepareManualB2CBooking = async (params) => {
    const courier = await loadBookableManualCourier(params, 'b2c');
    const localAwb = generateLocalAwb();
    return {
        courier,
        localAwb,
        shipmentData: {
            shipment_id: localAwb,
            awb_number: localAwb,
            courier_name: courier.displayName,
            courier_id: courier.courierId,
            provider_reference: localAwb,
            provider_request_id: localAwb,
            provider_last_status: 'booked',
        },
    };
};
exports.prepareManualB2CBooking = prepareManualB2CBooking;
const recordManualB2CShipment = async (input) => {
    const [shipment] = await input.tx
        .insert(manualCouriers_1.manualShipments)
        .values({
        manualCourierId: input.prepared.courier.id,
        orderType: 'b2c',
        b2cOrderId: input.orderId,
        userId: input.userId,
        localAwb: input.prepared.localAwb,
        commercialCourierName: input.prepared.courier.displayName,
        fulfilmentMode: 'unassigned',
        operationStatus: 'booked',
        rateCardId: /^[0-9a-f-]{36}$/i.test(normalizeText(input.params.shipping_rate_id))
            ? normalizeText(input.params.shipping_rate_id)
            : null,
        rateSnapshot: input.rateSnapshot,
        bookingMeta: {
            pickup_pincode: normalizePincode(input.params.pickup?.pincode || input.params.origin),
            destination_pincode: normalizePincode(input.params.consignee?.pincode),
            weight_kg: normalizeWeightKg(input.params.package_weight || input.params.weight),
            payment_type: input.params.payment_type,
        },
    })
        .returning();
    const eventAt = new Date();
    await input.tx.insert(manualCouriers_1.manualTrackingEvents).values({
        manualShipmentId: shipment.id,
        source: 'system',
        externalEventId: `booking:${input.orderId}`,
        statusCode: 'booked',
        statusText: 'Shipment booked',
        location: normalizeText(input.params.pickup?.city) || null,
        raw: { source: 'manual_courier_booking' },
        eventAt,
    });
    await input.tx.insert(trackingEvents_1.tracking_events).values({
        order_id: input.orderId,
        user_id: input.userId,
        awb_number: input.prepared.localAwb,
        courier: input.prepared.courier.displayName,
        status_code: 'booked',
        status_text: 'Shipment booked',
        location: normalizeText(input.params.pickup?.city) || null,
        raw: { source: 'manual_courier_booking' },
        created_at: eventAt,
    });
    return shipment;
};
exports.recordManualB2CShipment = recordManualB2CShipment;
const createManualB2BShipment = async (params, userId, isExternalApi = false) => {
    const courier = await loadBookableManualCourier(params, 'b2b');
    const localAwb = generateLocalAwb();
    const pickup = parseJsonObject(params.pickup);
    const boxes = Array.isArray(params.boxes) ? params.boxes : [];
    const weightKg = boxes.reduce((sum, box) => sum + toFiniteNumber(box?.weight) * Math.max(1, toFiniteNumber(box?.quantity, 1)), 0) || normalizeWeightKg(params.package_weight);
    const invoiceValue = toFiniteNumber(params.invoice_amount ?? params.order_amount);
    const rate = await (0, b2bAdmin_service_1.calculateB2BRate)({
        originPincode: normalizePincode(pickup.pincode || params.origin),
        destinationPincode: normalizePincode(params.consignee?.pincode),
        weightKg,
        length: toFiniteNumber(params.package_length) || undefined,
        width: toFiniteNumber(params.package_breadth) || undefined,
        height: toFiniteNumber(params.package_height) || undefined,
        invoiceValue,
        paymentMode: normalizeText(params.payment_type).toLowerCase() === 'cod' ? 'COD' : 'PREPAID',
        freightMode: 'fod',
        rovType: normalizeRovType(params.rov_type),
        courierScope: { courierId: courier.courierId, serviceProvider: MANUAL_PROVIDER },
    });
    const freight = Number(rate?.charges?.total || 0);
    if (freight <= 0)
        throw new classes_1.HttpError(400, 'No B2B rate card found for selected courier/route');
    const result = await client_1.db.transaction(async (tx) => {
        const [order] = await tx
            .insert(b2bOrders_1.b2b_orders)
            .values({
            user_id: userId,
            company_name: params.consignee?.company_name || '',
            company_gst: params.consignee?.gstin || '',
            order_number: normalizeText(params.order_number),
            cod_charges: normalizeText(params.payment_type).toLowerCase() === 'cod'
                ? toFiniteNumber(params.cod_charges)
                : 0,
            order_id: localAwb,
            order_date: normalizeText(params.order_date) || new Date().toISOString().slice(0, 10),
            order_amount: toFiniteNumber(params.order_amount),
            integration_type: MANUAL_PROVIDER,
            order_type: normalizeText(params.payment_type).toLowerCase() === 'cod' ? 'cod' : 'prepaid',
            freight_charges: freight.toString(),
            order_status: 'booked',
            invoice_number: normalizeText(params.invoice_number) || null,
            invoice_date: normalizeText(params.invoice_date) || null,
            invoice_amount: invoiceValue ? String(invoiceValue) : null,
            buyer_name: normalizeText(params.consignee?.name),
            buyer_phone: normalizeText(params.consignee?.phone),
            buyer_email: normalizeText(params.consignee?.email) || null,
            address: normalizeText(params.consignee?.address),
            city: normalizeText(params.consignee?.city),
            state: normalizeText(params.consignee?.state),
            country: 'India',
            pincode: normalizePincode(params.consignee?.pincode),
            products: Array.isArray(params.order_items) ? params.order_items : [],
            packages: boxes,
            weight: String(weightKg),
            length: params.package_length ? String(params.package_length) : null,
            breadth: params.package_breadth ? String(params.package_breadth) : null,
            height: params.package_height ? String(params.package_height) : null,
            charged_weight: String(weightKg),
            courier_partner: courier.displayName,
            courier_id: String(courier.courierId),
            awb_number: localAwb,
            shipment_id: localAwb,
            provider_reference: localAwb,
            provider_request_id: localAwb,
            provider_last_status: 'booked',
            provider_meta: { manual_courier_code: courier.code },
            charges_breakdown: rate.charges,
            pickup_location_id: params.pickup_location_id || pickup.warehouse_name || null,
            pickup_details: pickup,
            rto_details: parseJsonObject(params.rto),
            is_rto_different: params.is_rto_different === 'yes',
            is_external_api: isExternalApi,
            created_at: new Date(),
            updated_at: new Date(),
        })
            .returning();
        const [shipment] = await tx
            .insert(manualCouriers_1.manualShipments)
            .values({
            manualCourierId: courier.id,
            orderType: 'b2b',
            b2bOrderId: order.id,
            userId,
            localAwb,
            commercialCourierName: courier.displayName,
            fulfilmentMode: 'unassigned',
            operationStatus: 'booked',
            rateSnapshot: rate,
            bookingMeta: {
                pickup_pincode: normalizePincode(pickup.pincode || params.origin),
                destination_pincode: normalizePincode(params.consignee?.pincode),
                weight_kg: weightKg,
                payment_type: params.payment_type,
            },
        })
            .returning();
        await tx.insert(manualCouriers_1.manualTrackingEvents).values({
            manualShipmentId: shipment.id,
            source: 'system',
            externalEventId: `booking:${order.id}`,
            statusCode: 'booked',
            statusText: 'Shipment booked',
            location: normalizeText(pickup.city) || null,
            raw: { source: 'manual_courier_booking' },
            eventAt: new Date(),
        });
        return { order, shipment };
    });
    try {
        const labelKey = await (0, generateCustomLabelService_1.generateLabelForOrder)(result.order, userId, client_1.db);
        if (labelKey) {
            await client_1.db
                .update(b2bOrders_1.b2b_orders)
                .set({ label: labelKey, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, result.order.id));
        }
    }
    catch (error) {
        console.warn('[ManualCourier] B2B label generation failed', error?.message || error);
    }
    void (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.created', {
        order_id: result.order.id,
        order_number: result.order.order_number,
        awb_number: localAwb,
        status: 'booked',
        courier_partner: courier.displayName,
        payment_type: result.order.order_type,
        order_type: 'b2b',
        created_at: result.order.created_at || new Date().toISOString(),
        source: 'manual_courier_booking',
    }).catch((error) => console.error('Failed to send manual B2B order.created event:', error));
    return {
        order: {
            id: result.order.id,
            order_number: result.order.order_number,
            awb_number: localAwb,
        },
        shipment: { awb_number: localAwb, courier_name: courier.displayName },
    };
};
exports.createManualB2BShipment = createManualB2BShipment;
const resolveManualTrackingContext = async (awb) => {
    const normalizedAwb = normalizeText(awb);
    if (!normalizedAwb)
        return null;
    const [directShipment] = await client_1.db
        .select()
        .from(manualCouriers_1.manualShipments)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.localAwb, normalizedAwb))
        .limit(1);
    let shipment = directShipment;
    if (!shipment) {
        const [leg] = await client_1.db
            .select({ shipment: manualCouriers_1.manualShipments })
            .from(manualCouriers_1.manualFulfilmentLegs)
            .innerJoin(manualCouriers_1.manualShipments, (0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, manualCouriers_1.manualFulfilmentLegs.manualShipmentId))
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.actualAwb, normalizedAwb))
            .limit(1);
        shipment = leg?.shipment;
    }
    if (!shipment)
        return null;
    const [activeLeg] = await client_1.db
        .select()
        .from(manualCouriers_1.manualFulfilmentLegs)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, shipment.id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.isActive, true)))
        .orderBy((0, drizzle_orm_1.desc)(manualCouriers_1.manualFulfilmentLegs.createdAt))
        .limit(1);
    const manualEvents = await client_1.db
        .select()
        .from(manualCouriers_1.manualTrackingEvents)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualTrackingEvents.manualShipmentId, shipment.id))
        .orderBy((0, drizzle_orm_1.desc)(manualCouriers_1.manualTrackingEvents.eventAt), (0, drizzle_orm_1.desc)(manualCouriers_1.manualTrackingEvents.createdAt));
    const providerEvents = shipment.b2cOrderId
        ? await client_1.db
            .select()
            .from(trackingEvents_1.tracking_events)
            .where((0, drizzle_orm_1.eq)(trackingEvents_1.tracking_events.order_id, shipment.b2cOrderId))
            .orderBy((0, drizzle_orm_1.desc)(trackingEvents_1.tracking_events.created_at))
        : [];
    const events = [
        ...manualEvents,
        ...providerEvents.map((event) => ({
            id: `provider:${event.id}`,
            manualShipmentId: shipment.id,
            source: 'provider',
            externalEventId: event.id,
            statusCode: event.status_code || 'in_transit',
            statusText: event.status_text || event.status_code || 'Shipment in transit',
            location: event.location,
            remarks: null,
            raw: event.raw,
            eventAt: event.created_at || new Date(0),
            createdBy: null,
            createdAt: event.created_at || new Date(0),
        })),
    ].sort((left, right) => new Date(right.eventAt || right.createdAt || 0).getTime() -
        new Date(left.eventAt || left.createdAt || 0).getTime());
    return { shipment, activeLeg: activeLeg || null, events };
};
exports.resolveManualTrackingContext = resolveManualTrackingContext;
const getManualTrackingProviderData = (context) => ({
    status: context.events[0]?.statusText ||
        context.shipment.operationStatus ||
        'Shipment booked',
    courier_name: context.shipment.commercialCourierName,
    shipment_info: context.events[0]?.remarks || context.events[0]?.statusText || null,
    history: context.events.map((event) => ({
        status_code: event.statusCode,
        location: event.location || '',
        event_time: event.eventAt.toISOString(),
        message: event.remarks || event.statusText,
    })),
});
exports.getManualTrackingProviderData = getManualTrackingProviderData;
const resolveLocalAwbForProviderAwb = async (awb) => {
    const [row] = await client_1.db
        .select({
        localAwb: manualCouriers_1.manualShipments.localAwb,
        b2cOrderId: manualCouriers_1.manualShipments.b2cOrderId,
        b2bOrderId: manualCouriers_1.manualShipments.b2bOrderId,
        manualShipmentId: manualCouriers_1.manualShipments.id,
    })
        .from(manualCouriers_1.manualFulfilmentLegs)
        .innerJoin(manualCouriers_1.manualShipments, (0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, manualCouriers_1.manualFulfilmentLegs.manualShipmentId))
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.actualAwb, normalizeText(awb)))
        .limit(1);
    return row || null;
};
exports.resolveLocalAwbForProviderAwb = resolveLocalAwbForProviderAwb;
const listManualShipmentsForAdmin = async (filters) => {
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters.limit || 20)));
    const conditions = [];
    if (filters.status)
        conditions.push((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.operationStatus, filters.status));
    if (filters.fulfilmentMode) {
        conditions.push((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.fulfilmentMode, filters.fulfilmentMode));
    }
    if (filters.courierId)
        conditions.push((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.manualCourierId, filters.courierId));
    if (filters.search) {
        const term = `%${filters.search.trim()}%`;
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(manualCouriers_1.manualShipments.localAwb, term), (0, drizzle_orm_1.ilike)(manualCouriers_1.manualShipments.commercialCourierName, term), (0, drizzle_orm_1.ilike)(users_1.users.email, term)));
    }
    const where = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    const rows = await client_1.db
        .select({
        shipment: manualCouriers_1.manualShipments,
        courierCode: manualCouriers_1.manualCouriers.code,
        merchantEmail: users_1.users.email,
        b2cOrderNumber: b2cOrders_1.b2c_orders.order_number,
        b2cOrderStatus: b2cOrders_1.b2c_orders.order_status,
        b2cBuyerName: b2cOrders_1.b2c_orders.buyer_name,
        b2cDestinationPincode: b2cOrders_1.b2c_orders.pincode,
        b2cPaymentType: b2cOrders_1.b2c_orders.order_type,
        b2cOrderAmount: b2cOrders_1.b2c_orders.order_amount,
        b2cFreightCharges: b2cOrders_1.b2c_orders.freight_charges,
        b2cWalletDebit: b2cOrders_1.b2c_orders.wallet_debit_amount,
        b2bOrderNumber: b2bOrders_1.b2b_orders.order_number,
        b2bOrderStatus: b2bOrders_1.b2b_orders.order_status,
        b2bBuyerName: b2bOrders_1.b2b_orders.buyer_name,
        b2bDestinationPincode: b2bOrders_1.b2b_orders.pincode,
        b2bPaymentType: b2bOrders_1.b2b_orders.order_type,
        b2bOrderAmount: b2bOrders_1.b2b_orders.order_amount,
        b2bFreightCharges: b2bOrders_1.b2b_orders.freight_charges,
    })
        .from(manualCouriers_1.manualShipments)
        .innerJoin(manualCouriers_1.manualCouriers, (0, drizzle_orm_1.eq)(manualCouriers_1.manualCouriers.id, manualCouriers_1.manualShipments.manualCourierId))
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, manualCouriers_1.manualShipments.userId))
        .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, manualCouriers_1.manualShipments.b2cOrderId))
        .leftJoin(b2bOrders_1.b2b_orders, (0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, manualCouriers_1.manualShipments.b2bOrderId))
        .where(where)
        .orderBy((0, drizzle_orm_1.desc)(manualCouriers_1.manualShipments.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(manualCouriers_1.manualShipments)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, manualCouriers_1.manualShipments.userId))
        .where(where);
    return {
        data: rows.map((row) => {
            const isB2c = row.shipment.orderType === 'b2c';
            return {
                ...row.shipment,
                courierCode: row.courierCode,
                merchantEmail: row.merchantEmail,
                orderNumber: isB2c ? row.b2cOrderNumber : row.b2bOrderNumber,
                orderStatus: isB2c ? row.b2cOrderStatus : row.b2bOrderStatus,
                buyerName: isB2c ? row.b2cBuyerName : row.b2bBuyerName,
                destinationPincode: isB2c
                    ? row.b2cDestinationPincode
                    : row.b2bDestinationPincode,
                paymentType: isB2c ? row.b2cPaymentType : row.b2bPaymentType,
                orderAmount: Number(isB2c ? row.b2cOrderAmount : row.b2bOrderAmount || 0),
                freightCharges: Number(isB2c ? row.b2cFreightCharges : row.b2bFreightCharges || 0),
                walletDebit: isB2c ? Number(row.b2cWalletDebit || 0) : null,
            };
        }),
        totalCount: Number(count || 0),
        page,
        limit,
    };
};
exports.listManualShipmentsForAdmin = listManualShipmentsForAdmin;
const getManualShipmentAdminDetail = async (id) => {
    const [shipment] = await client_1.db
        .select()
        .from(manualCouriers_1.manualShipments)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, id))
        .limit(1);
    if (!shipment)
        throw new classes_1.HttpError(404, 'Manual courier shipment not found');
    const order = shipment.orderType === 'b2c'
        ? (await client_1.db
            .select()
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, shipment.b2cOrderId))
            .limit(1))[0]
        : (await client_1.db
            .select()
            .from(b2bOrders_1.b2b_orders)
            .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, shipment.b2bOrderId))
            .limit(1))[0];
    const [merchant] = await client_1.db
        .select({ id: users_1.users.id, email: users_1.users.email, phone: users_1.users.phone })
        .from(users_1.users)
        .where((0, drizzle_orm_1.eq)(users_1.users.id, shipment.userId))
        .limit(1);
    const legs = await client_1.db
        .select()
        .from(manualCouriers_1.manualFulfilmentLegs)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, shipment.id))
        .orderBy((0, drizzle_orm_1.desc)(manualCouriers_1.manualFulfilmentLegs.createdAt));
    const enrichedLegs = await Promise.all(legs.map(async (leg) => {
        const label = normalizeText(leg.providerLabel);
        if (!label)
            return { ...leg, providerLabelUrl: null };
        if (/^(https?:|data:)/i.test(label))
            return { ...leg, providerLabelUrl: label };
        try {
            const signed = await (0, upload_service_1.presignDownload)(label);
            return {
                ...leg,
                providerLabelUrl: Array.isArray(signed) ? signed[0] || null : signed || null,
            };
        }
        catch {
            return { ...leg, providerLabelUrl: null };
        }
    }));
    const trackingContext = await (0, exports.resolveManualTrackingContext)(shipment.localAwb);
    const events = trackingContext?.events || [];
    const transactions = order
        ? await client_1.db
            .select()
            .from(wallet_1.walletTransactions)
            .where((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.ref, order.id))
            .orderBy((0, drizzle_orm_1.desc)(wallet_1.walletTransactions.created_at))
        : [];
    return { shipment, order, merchant, legs: enrichedLegs, events, transactions };
};
exports.getManualShipmentAdminDetail = getManualShipmentAdminDetail;
const getManualShipmentStats = async () => {
    const [row] = await client_1.db
        .select({
        total: (0, drizzle_orm_1.sql) `count(*)::int`,
        unassigned: (0, drizzle_orm_1.sql) `count(*) filter (where ${manualCouriers_1.manualShipments.fulfilmentMode} = 'unassigned')::int`,
        manual: (0, drizzle_orm_1.sql) `count(*) filter (where ${manualCouriers_1.manualShipments.fulfilmentMode} = 'manual')::int`,
        integrated: (0, drizzle_orm_1.sql) `count(*) filter (where ${manualCouriers_1.manualShipments.fulfilmentMode} = 'integrated')::int`,
        actionRequired: (0, drizzle_orm_1.sql) `count(*) filter (where ${manualCouriers_1.manualShipments.operationStatus} = 'action_required')::int`,
    })
        .from(manualCouriers_1.manualShipments);
    return row;
};
exports.getManualShipmentStats = getManualShipmentStats;
const setManualFulfilmentMode = async (id, adminUserId) => {
    const detail = await (0, exports.getManualShipmentAdminDetail)(id);
    const orderStatus = normalizeText(detail.order?.order_status).toLowerCase();
    if (TERMINAL_SHIPMENT_STATUSES.has(orderStatus) ||
        TERMINAL_SHIPMENT_STATUSES.has(normalizeText(detail.shipment.operationStatus).toLowerCase())) {
        throw new classes_1.HttpError(409, 'Terminal shipments cannot be reassigned');
    }
    if (detail.shipment.operationStatus === 'provider_booking') {
        throw new classes_1.HttpError(409, 'Provider booking is already in progress');
    }
    if (detail.legs.some((leg) => leg.isActive)) {
        throw new classes_1.HttpError(409, 'An active provider AWB is already linked to this shipment');
    }
    await client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments}
          where id = ${id} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (lockedRow.cancelled_at ||
            TERMINAL_SHIPMENT_STATUSES.has(normalizeText(lockedRow.operation_status).toLowerCase())) {
            throw new classes_1.HttpError(409, 'Terminal shipments cannot be reassigned');
        }
        if (lockedRow.operation_status === 'provider_booking') {
            throw new classes_1.HttpError(409, 'Provider booking is already in progress');
        }
        const [activeLeg] = await tx
            .select({ id: manualCouriers_1.manualFulfilmentLegs.id })
            .from(manualCouriers_1.manualFulfilmentLegs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.isActive, true)))
            .limit(1);
        if (activeLeg)
            throw new classes_1.HttpError(409, 'An active provider AWB is already linked');
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({
            fulfilmentMode: 'manual',
            operationStatus: 'manual_processing',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, id));
        await tx.insert(manualCouriers_1.manualTrackingEvents).values({
            manualShipmentId: id,
            source: 'admin',
            externalEventId: `manual-mode:${Date.now()}`,
            statusCode: 'processing',
            statusText: 'Shipment processing',
            remarks: 'Assigned for fulfilment',
            raw: { admin_user_id: adminUserId },
            eventAt: new Date(),
            createdBy: adminUserId,
        });
    });
};
exports.setManualFulfilmentMode = setManualFulfilmentMode;
const addManualTrackingEvent = async (id, input, adminUserId) => {
    const detail = await (0, exports.getManualShipmentAdminDetail)(id);
    const statusCode = normalizeText(input.statusCode).toLowerCase().replace(/[\s-]+/g, '_');
    const statusText = normalizeText(input.statusText);
    if (!statusCode || !statusText) {
        throw new classes_1.HttpError(400, 'Tracking status and customer-facing message are required');
    }
    const eventAt = toDate(input.eventAt);
    const externalEventId = normalizeText(input.externalEventId) || `admin:${(0, crypto_1.randomUUID)()}`;
    const currentTerminalStatus = [
        normalizeText(detail.order?.order_status).toLowerCase(),
        normalizeText(detail.shipment.operationStatus).toLowerCase(),
    ].find((value) => TERMINAL_SHIPMENT_STATUSES.has(value));
    if (currentTerminalStatus && statusCode !== currentTerminalStatus) {
        throw new classes_1.HttpError(409, `Shipment is already ${currentTerminalStatus.replace(/_/g, ' ')}`);
    }
    const event = await client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments}
          where id = ${id} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        const lockedStatus = normalizeText(lockedRow.operation_status).toLowerCase();
        if (lockedRow.cancelled_at ||
            (TERMINAL_SHIPMENT_STATUSES.has(lockedStatus) && statusCode !== lockedStatus)) {
            throw new classes_1.HttpError(409, `Shipment is already ${lockedStatus.replace(/_/g, ' ')}`);
        }
        if (lockedStatus === 'provider_booking') {
            throw new classes_1.HttpError(409, 'Wait for the provider booking to finish or release the attempt');
        }
        const [created] = await tx
            .insert(manualCouriers_1.manualTrackingEvents)
            .values({
            manualShipmentId: id,
            source: 'admin',
            externalEventId,
            statusCode,
            statusText,
            location: normalizeText(input.location) || null,
            remarks: normalizeText(input.remarks) || null,
            raw: { admin_user_id: adminUserId },
            eventAt,
            createdBy: adminUserId,
        })
            .onConflictDoNothing()
            .returning();
        if (!created)
            throw new classes_1.HttpError(409, 'This tracking update was already recorded');
        const [latest] = await tx
            .select({ statusCode: manualCouriers_1.manualTrackingEvents.statusCode })
            .from(manualCouriers_1.manualTrackingEvents)
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualTrackingEvents.manualShipmentId, id))
            .orderBy((0, drizzle_orm_1.desc)(manualCouriers_1.manualTrackingEvents.eventAt), (0, drizzle_orm_1.desc)(manualCouriers_1.manualTrackingEvents.createdAt))
            .limit(1);
        const latestStatusCode = normalizeText(latest?.statusCode).toLowerCase();
        const operationStatus = latestStatusCode === 'delivered'
            ? 'delivered'
            : latestStatusCode === 'cancelled'
                ? 'cancelled'
                : latestStatusCode.startsWith('rto')
                    ? latestStatusCode
                    : 'in_progress';
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({
            operationStatus,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, id));
        return created;
    });
    const { trackByAwbService } = await Promise.resolve().then(() => __importStar(require('./shiprocket.service')));
    await trackByAwbService(detail.shipment.localAwb);
    return event;
};
exports.addManualTrackingEvent = addManualTrackingEvent;
const buildProviderBookingParams = (detail, input) => {
    if (detail.shipment.orderType !== 'b2c') {
        throw new classes_1.HttpError(400, 'Provider rebooking is currently available for B2C manual shipments');
    }
    const order = detail.order;
    const storedPickup = parseJsonObject(order.pickup_details);
    const hubPickup = {
        ...storedPickup,
        ...parseJsonObject(input.hubPickup),
    };
    const requiredHubFields = ['warehouse_name', 'address', 'city', 'state', 'pincode', 'phone'];
    const missing = requiredHubFields.filter((key) => !normalizeText(hubPickup[key]));
    if (missing.length) {
        throw new classes_1.HttpError(400, `Hub pickup is incomplete: ${missing.join(', ')}`);
    }
    return {
        order_number: `${order.order_number}-HUB`,
        order_date: order.order_date,
        order_amount: Number(order.order_amount || 0),
        payment_type: order.order_type,
        prepaid_amount: Number(order.prepaid_amount || 0),
        shipping_charges: Number(order.shipping_charges || 0),
        transaction_fee: Number(order.transaction_fee || 0),
        gift_wrap: Number(order.gift_wrap || 0),
        discount: Number(order.discount || 0),
        invoice_number: order.invoice_number,
        invoice_date: order.invoice_date,
        invoice_amount: Number(order.invoice_amount || order.order_amount || 0),
        consignee: {
            name: order.buyer_name,
            phone: order.buyer_phone,
            email: order.buyer_email,
            address: order.address,
            address_line_1: order.address_line_1,
            address_line_2: order.address_line_2,
            landmark: order.address_landmark,
            locality: order.address_locality,
            city: order.city,
            state: order.state,
            pincode: order.pincode,
        },
        pickup: hubPickup,
        pickup_location_id: normalizeText(input.pickupLocationId) || hubPickup.warehouse_name,
        rto: parseJsonObject(order.rto_details),
        is_rto_different: order.is_rto_different ? 'yes' : 'no',
        order_items: Array.isArray(order.products) ? order.products : [],
        package_weight: Number(order.weight || 0),
        package_length: Number(order.length || 0),
        package_breadth: Number(order.breadth || 0),
        package_height: Number(order.height || 0),
        integration_type: normalizeProvider(input.integrationType),
        courier_id: Number(input.courierId),
        courier_partner: normalizeText(input.courierPartner),
        shipping_rate_id: normalizeText(input.shippingRateId) || undefined,
        courier_option_key: normalizeText(input.courierOptionKey) || undefined,
        zone_id: normalizeText(input.zoneId) || undefined,
        selected_max_slab_weight: input.selectedMaxSlabWeight || undefined,
        amazon_request_token: input.amazonRequestToken || undefined,
        amazon_rate_id: input.amazonRateId || undefined,
        amazon_carrier_id: input.amazonCarrierId || undefined,
        amazon_service_id: input.amazonServiceId || undefined,
        request_auto_pickup: 'no',
    };
};
const getProviderOptionsForManualShipment = async (id, input = {}) => {
    const detail = await (0, exports.getManualShipmentAdminDetail)(id);
    if (detail.shipment.orderType !== 'b2c')
        return [];
    const order = detail.order;
    const hubPickup = { ...parseJsonObject(order.pickup_details), ...parseJsonObject(input.hubPickup) };
    const { fetchAvailableCouriersWithRates } = await Promise.resolve().then(() => __importStar(require('./shiprocket.service')));
    const options = await fetchAvailableCouriersWithRates({
        origin: Number(normalizePincode(hubPickup.pincode)),
        destination: Number(normalizePincode(order.pincode)),
        payment_type: order.order_type,
        order_amount: Number(order.order_amount || 0),
        weight: Number(order.weight || 0),
        length: Number(order.length || 0),
        breadth: Number(order.breadth || 0),
        height: Number(order.height || 0),
        pickupName: hubPickup.name || hubPickup.warehouse_name,
        pickupPhone: hubPickup.phone,
        pickupAddress: hubPickup.address,
        pickupCity: hubPickup.city,
        pickupState: hubPickup.state,
        deliveryName: order.buyer_name,
        deliveryPhone: order.buyer_phone,
        deliveryAddress: order.address,
        deliveryCity: order.city,
        deliveryState: order.state,
    }, detail.shipment.userId);
    return (options || []).filter((option) => SUPPORTED_PROVIDER_REBOOKS.has(normalizeProvider(option.integration_type || option.serviceProvider)));
};
exports.getProviderOptionsForManualShipment = getProviderOptionsForManualShipment;
const startProviderBookingAttempt = async (id, input, adminUserId) => {
    const detail = await (0, exports.getManualShipmentAdminDetail)(id);
    const orderStatus = normalizeText(detail.order?.order_status).toLowerCase();
    if (TERMINAL_SHIPMENT_STATUSES.has(orderStatus) ||
        TERMINAL_SHIPMENT_STATUSES.has(normalizeText(detail.shipment.operationStatus).toLowerCase())) {
        throw new classes_1.HttpError(409, 'Terminal shipments cannot be booked with a provider');
    }
    const provider = normalizeProvider(input.integrationType);
    if (!SUPPORTED_PROVIDER_REBOOKS.has(provider)) {
        throw new classes_1.HttpError(400, 'Select a supported integrated courier');
    }
    const attemptKey = normalizeText(input.idempotencyKey) || (0, crypto_1.randomUUID)();
    const providerParams = buildProviderBookingParams(detail, input);
    const [existingAttempt] = await client_1.db
        .select()
        .from(manualCouriers_1.manualFulfilmentLegs)
        .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.attemptKey, attemptKey))
        .limit(1);
    if (existingAttempt?.status === 'booked') {
        return {
            detail,
            attempt: existingAttempt,
            providerParams,
            completed: true,
        };
    }
    if (existingAttempt) {
        throw new classes_1.HttpError(409, existingAttempt.status === 'booking'
            ? 'This provider booking request is already in progress'
            : 'This idempotency key was already used; retry with a new request key');
    }
    const active = detail.legs.find((leg) => leg.isActive);
    if (active)
        throw new classes_1.HttpError(409, 'This shipment already has an active provider AWB');
    if (detail.shipment.operationStatus === 'provider_booking') {
        throw new classes_1.HttpError(409, 'A provider booking is already in progress');
    }
    const [attempt] = await client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments} where id = ${id} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (lockedRow.cancelled_at ||
            TERMINAL_SHIPMENT_STATUSES.has(normalizeText(lockedRow.operation_status).toLowerCase())) {
            throw new classes_1.HttpError(409, 'Terminal shipments cannot be booked with a provider');
        }
        if (lockedRow.operation_status === 'provider_booking') {
            throw new classes_1.HttpError(409, 'A provider booking is already in progress');
        }
        const [activeLeg] = await tx
            .select({ id: manualCouriers_1.manualFulfilmentLegs.id })
            .from(manualCouriers_1.manualFulfilmentLegs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.isActive, true)))
            .limit(1);
        if (activeLeg)
            throw new classes_1.HttpError(409, 'This shipment already has an active provider AWB');
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({ operationStatus: 'provider_booking', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, id));
        return tx
            .insert(manualCouriers_1.manualFulfilmentLegs)
            .values({
            manualShipmentId: id,
            attemptKey,
            provider,
            providerCourierId: Number(input.courierId),
            providerCourierName: normalizeText(input.courierPartner) || null,
            status: 'booking',
            isActive: false,
            requestSnapshot: providerParams,
            createdBy: adminUserId,
        })
            .returning();
    });
    return { detail, attempt, providerParams, completed: false };
};
exports.startProviderBookingAttempt = startProviderBookingAttempt;
const completeProviderBookingAttempt = async (input) => {
    const actualAwb = normalizeText(input.shipmentMeta?.awb_number);
    if (!actualAwb)
        throw new classes_1.HttpError(502, 'Provider booking returned no AWB');
    return client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments}
          where id = ${input.manualShipmentId} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (lockedRow.cancelled_at ||
            TERMINAL_SHIPMENT_STATUSES.has(normalizeText(lockedRow.operation_status).toLowerCase())) {
            throw new classes_1.HttpError(409, 'Shipment was cancelled or completed during provider booking');
        }
        const [bookingAttempt] = await tx
            .select({ id: manualCouriers_1.manualFulfilmentLegs.id })
            .from(manualCouriers_1.manualFulfilmentLegs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.id, input.attemptId), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, input.manualShipmentId), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.status, 'booking')))
            .limit(1);
        if (!bookingAttempt) {
            throw new classes_1.HttpError(409, 'Provider booking attempt is no longer active');
        }
        await tx
            .update(manualCouriers_1.manualFulfilmentLegs)
            .set({ isActive: false, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, input.manualShipmentId));
        const [leg] = await tx
            .update(manualCouriers_1.manualFulfilmentLegs)
            .set({
            actualAwb,
            providerReference: normalizeText(input.shipmentMeta?.provider_reference) || null,
            providerRequestId: normalizeText(input.shipmentMeta?.provider_request_id) || null,
            providerLabel: normalizeText(input.shipmentMeta?.amazon_label || input.shipmentMeta?.label) || null,
            providerResponse: input.providerResponse,
            status: 'booked',
            isActive: true,
            errorMessage: null,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.id, input.attemptId))
            .returning();
        if (!leg)
            throw new classes_1.HttpError(409, 'Provider booking attempt no longer exists');
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({
            fulfilmentMode: 'integrated',
            operationStatus: 'provider_booked',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, input.manualShipmentId));
        return leg;
    });
};
exports.completeProviderBookingAttempt = completeProviderBookingAttempt;
const failProviderBookingAttempt = async (manualShipmentId, attemptId, error) => {
    const message = error instanceof Error ? error.message : normalizeText(error);
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(manualCouriers_1.manualFulfilmentLegs)
            .set({
            status: 'failed',
            isActive: false,
            errorMessage: message.slice(0, 2000),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.id, attemptId));
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({ operationStatus: 'action_required', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, manualShipmentId), (0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.operationStatus, 'provider_booking')));
    });
};
exports.failProviderBookingAttempt = failProviderBookingAttempt;
const releaseProviderBookingAttempt = async (manualShipmentId, adminUserId, reason = 'Provider booking state released by an administrator') => {
    return client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status from ${manualCouriers_1.manualShipments}
          where id = ${manualShipmentId} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (lockedRow.operation_status !== 'provider_booking') {
            throw new classes_1.HttpError(409, 'This shipment has no provider booking in progress');
        }
        const released = await tx
            .update(manualCouriers_1.manualFulfilmentLegs)
            .set({
            status: 'failed',
            isActive: false,
            errorMessage: normalizeText(reason).slice(0, 2000),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, manualShipmentId), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.status, 'booking')))
            .returning({ id: manualCouriers_1.manualFulfilmentLegs.id });
        if (!released.length) {
            throw new classes_1.HttpError(409, 'No active provider booking attempt was found');
        }
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({ operationStatus: 'action_required', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, manualShipmentId));
        return { releasedAttempts: released.length, releasedBy: adminUserId };
    });
};
exports.releaseProviderBookingAttempt = releaseProviderBookingAttempt;
const markManualShipmentActionRequired = async (b2cOrderId, action, payload = {}) => {
    return client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments}
          where b2c_order_id = ${b2cOrderId} for update`);
        const shipment = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!shipment)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (shipment.cancelled_at ||
            TERMINAL_SHIPMENT_STATUSES.has(normalizeText(shipment.operation_status).toLowerCase())) {
            throw new classes_1.HttpError(409, 'Delivery actions cannot be added to a terminal shipment');
        }
        if (shipment.operation_status === 'provider_booking') {
            throw new classes_1.HttpError(409, 'Wait for the provider booking to finish before adding an action');
        }
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({ operationStatus: 'action_required', updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, shipment.id));
        const [event] = await tx
            .insert(manualCouriers_1.manualTrackingEvents)
            .values({
            manualShipmentId: shipment.id,
            source: 'customer',
            externalEventId: `ndr-action:${(0, crypto_1.randomUUID)()}`,
            statusCode: 'delivery_action_requested',
            statusText: 'Delivery action requested',
            remarks: normalizeText(action).replace(/[_-]+/g, ' '),
            raw: payload,
            eventAt: new Date(),
        })
            .returning();
        return { shipment, event };
    });
};
exports.markManualShipmentActionRequired = markManualShipmentActionRequired;
const attachProviderAwbForReconciliation = async (id, input, adminUserId) => {
    const provider = normalizeProvider(input.integrationType);
    const actualAwb = normalizeText(input.actualAwb);
    if (!SUPPORTED_PROVIDER_REBOOKS.has(provider) || !actualAwb) {
        throw new classes_1.HttpError(400, 'Provider and actual AWB are required');
    }
    return client_1.db.transaction(async (tx) => {
        const lockedResult = await tx.execute((0, drizzle_orm_1.sql) `select id, operation_status, cancelled_at from ${manualCouriers_1.manualShipments}
          where id = ${id} for update`);
        const lockedRow = lockedResult?.rows?.[0] ?? lockedResult?.[0];
        if (!lockedRow)
            throw new classes_1.HttpError(404, 'Manual courier shipment not found');
        if (lockedRow.cancelled_at ||
            TERMINAL_SHIPMENT_STATUSES.has(normalizeText(lockedRow.operation_status).toLowerCase())) {
            throw new classes_1.HttpError(409, 'Terminal shipments cannot be reconciled');
        }
        const [activeLeg] = await tx
            .select({ id: manualCouriers_1.manualFulfilmentLegs.id })
            .from(manualCouriers_1.manualFulfilmentLegs)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.isActive, true)))
            .limit(1);
        if (activeLeg)
            throw new classes_1.HttpError(409, 'This shipment already has an active provider AWB');
        const [leg] = await tx
            .insert(manualCouriers_1.manualFulfilmentLegs)
            .values({
            manualShipmentId: id,
            attemptKey: normalizeText(input.idempotencyKey) || `reconcile:${provider}:${actualAwb}`,
            provider,
            providerCourierId: input.courierId ? Number(input.courierId) : null,
            providerCourierName: normalizeText(input.courierPartner) || null,
            actualAwb,
            providerReference: normalizeText(input.providerReference) || null,
            providerRequestId: normalizeText(input.providerRequestId) || null,
            providerLabel: normalizeText(input.providerLabel) || null,
            status: 'booked',
            isActive: true,
            requestSnapshot: { source: 'admin_reconciliation' },
            createdBy: adminUserId,
        })
            .returning();
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({
            fulfilmentMode: 'integrated',
            operationStatus: 'provider_booked',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, id));
        return leg;
    });
};
exports.attachProviderAwbForReconciliation = attachProviderAwbForReconciliation;
const markManualShipmentCancelled = async (localAwb, reason = 'Shipment cancelled') => {
    const context = await (0, exports.resolveManualTrackingContext)(localAwb);
    if (!context)
        return;
    const now = new Date();
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(manualCouriers_1.manualShipments)
            .set({
            operationStatus: 'cancelled',
            cancelledAt: now,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.eq)(manualCouriers_1.manualShipments.id, context.shipment.id));
        await tx
            .update(manualCouriers_1.manualFulfilmentLegs)
            .set({ status: 'cancelled', updatedAt: now })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.manualShipmentId, context.shipment.id), (0, drizzle_orm_1.eq)(manualCouriers_1.manualFulfilmentLegs.isActive, true)));
        await tx.insert(manualCouriers_1.manualTrackingEvents).values({
            manualShipmentId: context.shipment.id,
            source: 'system',
            externalEventId: `cancelled:${context.shipment.id}`,
            statusCode: 'cancelled',
            statusText: 'Shipment cancelled',
            remarks: reason,
            raw: { source: 'order_cancellation' },
            eventAt: now,
        }).onConflictDoNothing();
    });
};
exports.markManualShipmentCancelled = markManualShipmentCancelled;
