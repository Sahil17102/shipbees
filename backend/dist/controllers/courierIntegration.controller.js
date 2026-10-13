"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourierController = exports.fetchB2BRateQuotesToUser = exports.fetchAvailableCouriersToUser = exports.getAvailableCouriersForUserFromBody = exports.fetchAvailableCouriersForGuestController = exports.fetchAvailableCouriers = exports.getToken = exports.getCourier = exports.getCouriers = void 0;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const shippingRates_1 = require("../models/schema/shippingRates");
const b2cRateCard_service_1 = require("../models/services/b2cRateCard.service");
const courierIntegration_service_1 = require("../models/services/courierIntegration.service");
const plan_service_1 = require("../models/services/plan.service");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const paymentOptions_service_1 = require("../models/services/paymentOptions.service");
const delhiveryCourier_1 = require("../utils/delhiveryCourier");
const gst_1 = require("../utils/gst");
const orderAmount_1 = require("../utils/orderAmount");
const manualCourier_service_1 = require("../models/services/manualCourier.service");
const parseOptionalBoolean = (value) => {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized))
            return true;
        if (['false', '0', 'no', 'n'].includes(normalized))
            return false;
    }
    return undefined;
};
const parseOptionalNumber = (value) => {
    if (value === null || value === undefined || value === '')
        return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
};
const extractPreferredCarrierIds = (raw) => {
    if (!Array.isArray(raw))
        return undefined;
    const ids = raw
        .map((val) => parseOptionalNumber(val))
        .filter((val) => typeof val === 'number');
    return ids.length ? ids : undefined;
};
const buildServiceabilityOptions = (body) => {
    const options = {};
    const copyStringOption = (keys, targetKey) => {
        const value = keys
            .map((key) => body?.[key])
            .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim());
        if (value !== undefined) {
            options[targetKey] = String(value).trim();
        }
    };
    const pickupIdRaw = body?.pickupId ?? body?.pickup_id;
    if (pickupIdRaw !== undefined && pickupIdRaw !== null && pickupIdRaw !== '') {
        options.pickupId = String(pickupIdRaw);
    }
    copyStringOption(['pickupName', 'pickup_name'], 'pickupName');
    copyStringOption(['pickupPhone', 'pickup_phone'], 'pickupPhone');
    copyStringOption(['pickupAddress', 'pickup_address'], 'pickupAddress');
    copyStringOption(['pickupCity', 'pickup_city'], 'pickupCity');
    copyStringOption(['pickupState', 'pickup_state'], 'pickupState');
    copyStringOption(['deliveryName', 'delivery_name'], 'deliveryName');
    copyStringOption(['deliveryPhone', 'delivery_phone'], 'deliveryPhone');
    copyStringOption(['deliveryAddress', 'delivery_address'], 'deliveryAddress');
    copyStringOption(['deliveryCity', 'delivery_city'], 'deliveryCity');
    copyStringOption(['deliveryState', 'delivery_state'], 'deliveryState');
    copyStringOption(['shadowfax_forward_mode', 'shadowfaxForwardMode'], 'shadowfax_forward_mode');
    copyStringOption(['shadowfax_service_mode', 'shadowfaxServiceMode'], 'shadowfax_service_mode');
    const preferredCarrierIds = extractPreferredCarrierIds(body?.preferred_carriers ?? body?.preferredCarriers);
    if (preferredCarrierIds) {
        options.preferred_carriers = preferredCarrierIds;
    }
    const deliveryType = parseOptionalNumber(body?.delivery_type ?? body?.deliveryType);
    if (deliveryType !== undefined) {
        options.delivery_type = deliveryType;
    }
    const extraInfo = parseOptionalBoolean(body?.extra_info ?? body?.extraInfo) ?? undefined;
    if (extraInfo !== undefined) {
        options.extra_info = extraInfo;
    }
    const costInfo = parseOptionalBoolean(body?.cost_info ?? body?.costInfo) ?? undefined;
    if (costInfo !== undefined) {
        options.cost_info = costInfo;
    }
    const explicitSource = parseOptionalNumber(body?.source_pincode ?? body?.sourcePincode);
    if (explicitSource !== undefined) {
        options.source_pincode = explicitSource;
    }
    const explicitDestination = parseOptionalNumber(body?.destination_pincode ?? body?.destinationPincode);
    if (explicitDestination !== undefined) {
        options.destination_pincode = explicitDestination;
    }
    const isReverse = parseOptionalBoolean(body?.isReverse ?? body?.is_reverse) ??
        (typeof body?.payment_type === 'string' && body.payment_type.toLowerCase() === 'reverse'
            ? true
            : undefined);
    if (isReverse !== undefined) {
        options.isReverse = isReverse;
    }
    // Lightweight flag so downstream can optimise for calculator vs shipment flows.
    // Shipment courier selection must stay live because providers like Amazon need
    // a fresh rate token before the option can be booked.
    const context = String(body?.context || '')
        .trim()
        .toLowerCase();
    const isCalculator = context !== 'shipment_courier_selection' &&
        (context === 'rate_calculator' || body?.isCalculator === true || body?.is_calculator === true);
    if (isCalculator) {
        options.isCalculator = true;
    }
    return options;
};
const SUPPORTED_B2C_FALLBACK_PROVIDERS = [
    'delhivery',
    'ekart',
    'xpressbees',
    'shadowfax',
    'amazon',
    'indiapost',
];
const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const getOptionalNumber = (value) => {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const getCourierBillingBaseAmount = (courier, paymentType) => {
    const isReverse = String(paymentType || '').toLowerCase() === 'reverse';
    const activeRate = isReverse
        ? courier?.localRates?.rto ?? courier?.localRates?.forward ?? {}
        : courier?.localRates?.forward ?? {};
    const explicitTotal = getOptionalNumber(activeRate.total_charges ?? courier?.total_charges);
    if (explicitTotal !== undefined)
        return Math.max(0, explicitTotal);
    const freight = getOptionalNumber(activeRate.rate ?? courier?.rate ?? courier?.freight_charges) ?? 0;
    const cod = String(paymentType || '').toLowerCase() === 'cod'
        ? getOptionalNumber(activeRate.cod_charges ?? courier?.cod_charges) ?? 0
        : 0;
    const other = getOptionalNumber(activeRate.other_charges ?? courier?.other_charges) ?? 0;
    return Math.max(0, freight + cod + other);
};
const applyGstToCouriers = async (couriers, paymentType) => {
    if (!Array.isArray(couriers) || couriers.length === 0)
        return [];
    const paymentSettings = await (0, paymentOptions_service_1.getPaymentOptions)();
    const gstPercent = Number(paymentSettings.gstPercent ?? 0);
    return couriers.map((courier) => {
        const isReverse = String(paymentType || '').toLowerCase() === 'reverse';
        const activeRateKey = isReverse ? 'rto' : 'forward';
        const breakup = (0, gst_1.calculateGstBreakup)(getCourierBillingBaseAmount(courier, paymentType), gstPercent);
        const activeRate = courier?.localRates?.[activeRateKey];
        const taxFields = {
            gst_percent: breakup.gstPercent,
            gst_amount: breakup.gstAmount,
            total_charges_without_gst: breakup.baseAmount,
            total_charges_with_gst: breakup.totalAmount,
            wallet_debit_amount: breakup.totalAmount,
            tax_label: 'Courier rate + taxes',
        };
        return {
            ...courier,
            ...taxFields,
            localRates: courier?.localRates
                ? {
                    ...courier.localRates,
                    [activeRateKey]: activeRate ? { ...activeRate, ...taxFields } : activeRate,
                }
                : courier?.localRates,
        };
    });
};
const normalizeWeightToGrams = (value) => {
    const numeric = toNumber(value);
    if (numeric <= 0)
        return 0;
    return numeric > 50 ? Math.round(numeric) : Math.round(numeric * 1000);
};
const inferB2CFallbackProvider = (rate) => {
    const explicitProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(rate.service_provider);
    if (explicitProvider)
        return explicitProvider;
    const name = String(rate.courier_name || '').toLowerCase();
    if (name.includes('delhivery'))
        return 'delhivery';
    if (name.includes('ekart'))
        return 'ekart';
    if (name.includes('xpress'))
        return 'xpressbees';
    if (name.includes('shadowfax'))
        return 'shadowfax';
    if (name.includes('amazon'))
        return 'amazon';
    if (name.includes('india post') || name.includes('speed post'))
        return 'indiapost';
    return '';
};
const isSupportedB2CFallbackRate = (provider, rate) => {
    const name = String(rate.courier_name || '').toLowerCase();
    const mode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(rate.mode);
    if (!SUPPORTED_B2C_FALLBACK_PROVIDERS.includes(provider))
        return false;
    if (provider === 'xpressbees') {
        return (mode !== 'air' &&
            !name.includes('air') &&
            !name.includes('reverse') &&
            /\b2\s*(?:k\.?\s*g\.?|kg|kgs)\b/i.test(name));
    }
    return true;
};
const getB2CFallbackRateMeta = (rate) => {
    const provider = inferB2CFallbackProvider(rate);
    if (provider === 'delhivery') {
        const shippingMode = (0, delhiveryCourier_1.resolveDelhiveryShippingMode)({
            courierId: rate.courier_id,
            mode: rate.mode,
            courierName: rate.courier_name,
        });
        const courierId = (0, delhiveryCourier_1.getCanonicalDelhiveryCourierIdByMode)(shippingMode);
        if (shippingMode && courierId) {
            return {
                provider,
                courierId,
                courierName: (0, delhiveryCourier_1.getDelhiveryCourierDisplayName)(shippingMode),
                mode: shippingMode === 'Express' ? 'air' : 'surface',
            };
        }
    }
    return {
        provider,
        courierId: Number(rate.courier_id),
        courierName: rate.courier_name,
        mode: (0, b2cRateCard_service_1.normalizeB2CShippingMode)(rate.mode),
    };
};
const fetchEnabledB2CFallbackCourierMap = async () => {
    const rows = await client_1.db
        .select({
        id: couriers_1.couriers.id,
        name: couriers_1.couriers.name,
        serviceProvider: couriers_1.couriers.serviceProvider,
    })
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true), (0, drizzle_orm_1.sql) `${couriers_1.couriers.businessType} @> '["b2c"]'::jsonb`));
    return new Map(rows.map((row) => [
        `${Number(row.id)}__${(0, b2cRateCard_service_1.normalizeB2CServiceProvider)(row.serviceProvider)}`,
        row,
    ]));
};
const fetchB2CFallbackPlanIds = async (userId) => {
    const planIds = [];
    let hasActiveUserPlan = false;
    if (userId) {
        const activeUserPlanId = await (0, plan_service_1.getUserPlanId)(userId, 'b2c');
        if (activeUserPlanId) {
            planIds.push(activeUserPlanId);
            hasActiveUserPlan = true;
        }
    }
    if (userId && !hasActiveUserPlan) {
        const fallbackPlan = await (0, plan_service_1.getDefaultPlanByBusinessType)('b2c');
        if (fallbackPlan?.id)
            planIds.push(fallbackPlan.id);
    }
    if (!userId) {
        const publicFallbackPlan = await (0, plan_service_1.getDefaultPlanByBusinessType)('b2c');
        if (publicFallbackPlan?.id)
            planIds.push(publicFallbackPlan.id);
    }
    if (userId) {
        return Array.from(new Set(planIds));
    }
    const [firstRatePlan] = await client_1.db
        .select({ planId: shippingRates_1.shippingRates.plan_id })
        .from(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'))
        .limit(1);
    if (firstRatePlan?.planId)
        planIds.push(firstRatePlan.planId);
    return Array.from(new Set(planIds));
};
const fetchB2CRateRowsForFallback = async (params) => {
    const conditions = [(0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c')];
    if (params.rateType)
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, params.rateType));
    if (params.planId)
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, params.planId));
    return client_1.db
        .select()
        .from(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRates.last_updated));
};
const buildLastResortB2CCouriersFromRateCards = async (serviceParams, userId) => {
    const isReverse = serviceParams?.isReverse === true || serviceParams?.payment_type === 'reverse';
    const rateType = isReverse ? 'rto' : 'forward';
    const planIds = await fetchB2CFallbackPlanIds(userId);
    let rateRows = [];
    for (const planId of planIds) {
        rateRows = await fetchB2CRateRowsForFallback({ planId, rateType });
        if (rateRows.length)
            break;
    }
    if (!rateRows.length) {
        rateRows = await fetchB2CRateRowsForFallback({ rateType });
    }
    if (!rateRows.length && rateType !== 'forward') {
        rateRows = await fetchB2CRateRowsForFallback({ rateType: 'forward' });
    }
    if (!rateRows.length)
        return [];
    const rateIds = rateRows.map((rate) => rate.id);
    let slabs = [];
    try {
        slabs = await client_1.db
            .select()
            .from(shippingRates_1.shippingRateSlabs)
            .where((0, drizzle_orm_1.inArray)(shippingRates_1.shippingRateSlabs.shipping_rate_id, rateIds))
            .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.shipping_rate_id), (0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.weight_from));
    }
    catch (err) {
        console.warn('[Couriers] B2C fallback slab lookup failed, using legacy rate rows', {
            message: err?.message || err,
        });
    }
    const slabMap = new Map();
    for (const slab of slabs) {
        const list = slabMap.get(slab.shipping_rate_id) || [];
        list.push(slab);
        slabMap.set(slab.shipping_rate_id, list);
    }
    const actualWeightG = normalizeWeightToGrams(serviceParams?.weight);
    const lengthCm = toNumber(serviceParams?.length);
    const breadthCm = toNumber(serviceParams?.breadth);
    const heightCm = toNumber(serviceParams?.height);
    const shouldIncludeCod = String(serviceParams?.payment_type || '').toLowerCase() === 'cod';
    const cardsByKey = new Map();
    const enabledCourierMap = await fetchEnabledB2CFallbackCourierMap();
    for (const row of rateRows) {
        const rateMeta = getB2CFallbackRateMeta(row);
        const { provider } = rateMeta;
        if (!isSupportedB2CFallbackRate(provider, row))
            continue;
        if (!Number.isFinite(rateMeta.courierId))
            continue;
        const enabledCourier = enabledCourierMap.get(`${rateMeta.courierId}__${provider}`);
        if (!enabledCourier)
            continue;
        const rowSlabs = (slabMap.get(row.id) || []).map((slab) => ({
            id: slab.id,
            weight_from: toNumber(slab.weight_from),
            weight_to: slab.weight_to === null ? null : toNumber(slab.weight_to),
            rate: toNumber(slab.rate),
            extra_rate: slab.extra_rate === null ? null : toNumber(slab.extra_rate),
            extra_weight_unit: slab.extra_weight_unit === null ? null : toNumber(slab.extra_weight_unit),
        }));
        const rateCard = {
            shippingRateId: row.id,
            courier_id: rateMeta.courierId,
            courier_name: rateMeta.courierName,
            service_provider: provider,
            zone_id: row.zone_id,
            type: row.type,
            mode: rateMeta.mode,
            cod_charges: toNumber(row.cod_charges),
            cod_percent: toNumber(row.cod_percent),
            other_charges: toNumber(row.other_charges),
            min_weight: toNumber(row.min_weight),
            base_rate: toNumber(row.rate),
            slabs: rowSlabs,
        };
        const computed = (0, b2cRateCard_service_1.computeB2CRateCardCharge)({
            actual_weight_g: actualWeightG,
            length_cm: lengthCm,
            width_cm: breadthCm,
            height_cm: heightCm,
            rateCard,
        });
        const freight = computed.freight > 0 ? computed.freight : toNumber(row.rate);
        if (freight <= 0)
            continue;
        const codCharges = shouldIncludeCod
            ? (0, b2cRateCard_service_1.computeEffectiveB2CCodCharge)({
                cod_charges: toNumber(row.cod_charges),
                cod_percent: toNumber(row.cod_percent),
                order_amount: serviceParams?.order_amount,
            })
            : 0;
        const mode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(rateMeta.mode);
        const maxSlabWeight = computed.max_slab_weight ?? null;
        const displayName = computed.matched_by !== 'legacy'
            ? (0, b2cRateCard_service_1.formatCourierSlabDisplayName)(rateMeta.courierName, maxSlabWeight)
            : rateMeta.courierName;
        const optionKey = `${rateMeta.courierId}__${provider}__${row.id}__${maxSlabWeight ?? 'base'}`;
        const rateDetails = {
            rate: freight,
            cod_charges: codCharges,
            cod_percent: shouldIncludeCod ? toNumber(row.cod_percent) : 0,
            other_charges: toNumber(row.other_charges),
            shipping_rate_id: row.id,
            mode,
            min_weight: toNumber(row.min_weight),
            slabs: computed.slabs,
            zone_id: row.zone_id,
            zone: null,
            zone_code: null,
            zone_name: null,
            selected_slab: computed.selected_slab,
            slab_weight: computed.slab_weight,
            chargeable_weight: computed.chargeable_weight,
            volumetric_weight: computed.volumetric_weight,
            slab_count: computed.slabs,
            max_slab_weight: maxSlabWeight,
            matched_by: computed.matched_by,
        };
        const card = {
            id: rateMeta.courierId,
            courier_id: rateMeta.courierId,
            name: displayName,
            displayName,
            courier_option_key: optionKey,
            rate_card_id: row.id,
            integration_type: provider,
            serviceProvider: provider,
            cod: true,
            prepaid: true,
            edd: '3-5 Days',
            localRates: { [rateType]: rateDetails, forward: rateDetails },
            approxZone: null,
            zone: null,
            zone_id: row.zone_id,
            zone_code: null,
            zone_name: null,
            shipping_mode: mode || null,
            service_mode: mode || null,
            provider_serviceability: {
                fallback: true,
                reason: 'last_resort_rate_card',
                enabled_courier_name: enabledCourier.name,
                shipping_mode: mode || null,
                service_mode: mode || null,
            },
            courier_cost_estimate: freight + codCharges + toNumber(row.other_charges),
            freight_charges: freight,
            cod_charges: codCharges,
            other_charges: toNumber(row.other_charges),
            total_charges: freight + codCharges + toNumber(row.other_charges),
            chargeable_weight: computed.chargeable_weight,
            volumetric_weight: computed.volumetric_weight,
            slabs: computed.slabs,
            rate: freight,
            max_slab_weight: maxSlabWeight,
            rate_card_fallback: 'last_resort',
        };
        const existing = cardsByKey.get(optionKey);
        if (!existing || Number(existing.rate || Infinity) > freight) {
            cardsByKey.set(optionKey, card);
        }
    }
    return Array.from(cardsByKey.values()).sort((left, right) => Number(left.rate || Infinity) - Number(right.rate || Infinity));
};
const fetchB2CCouriersWithLocalFallback = async (serviceParams, userId) => {
    try {
        return await (0, shiprocket_service_1.fetchAvailableCouriersWithRates)(serviceParams, userId);
    }
    catch (err) {
        console.warn('[Couriers] B2C courier fetch failed, retrying fallback paths', {
            message: err?.message || err,
            origin: serviceParams?.origin,
            destination: serviceParams?.destination,
            shipment_type: serviceParams?.shipment_type,
            isCalculator: serviceParams?.isCalculator === true,
        });
        if (serviceParams?.isCalculator !== true) {
            try {
                return await (0, shiprocket_service_1.fetchAvailableCouriersWithRates)({
                    ...serviceParams,
                    isCalculator: true,
                }, userId);
            }
            catch (fallbackErr) {
                console.warn('[Couriers] Local rate-card pipeline failed, using direct rate-card fallback', {
                    message: fallbackErr?.message || fallbackErr,
                });
            }
        }
        console.warn('[Couriers] No strict B2C rate-card result available; returning no couriers');
        return [];
    }
};
// src/controllers/courier.controller.ts
const getCouriers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        // ✅ Extract filters from query
        const name = req.query.name?.toString();
        const masterCompany = req.query.masterCompany?.toString();
        const podAvailable = req.query.podAvailable?.toString(); // "yes" | "no"
        const realtimeTracking = req.query.realtimeTracking?.toString();
        const isHyperlocal = req.query.isHyperlocal;
        // ✅ Validate and map sortBy
        const rawSortBy = req.query.sortBy?.toString();
        const sortBy = ['latest', 'oldest', 'az', 'za'].includes(rawSortBy ?? '')
            ? rawSortBy
            : undefined;
        const filters = {
            name,
            masterCompany,
            podAvailable,
            realtimeTracking,
            isHyperlocal: isHyperlocal === 'true' ? true : isHyperlocal === 'false' ? false : undefined,
        };
        const [couriers, summary, totalCount] = await Promise.all([
            (0, courierIntegration_service_1.getAllCouriersPaginated)({ limit, offset, filters, sortBy }),
            (0, courierIntegration_service_1.getCourierSummary)(),
            (0, courierIntegration_service_1.getCourierCount)(filters),
        ]);
        res.json({
            status: 'success',
            data: {
                summary,
                couriers,
                totalCount,
                page,
                limit,
            },
        });
    }
    catch (error) {
        console.error('[getCouriers] error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch couriers and summary.' });
    }
};
exports.getCouriers = getCouriers;
const getCourier = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ status: 'error', message: 'Invalid ID.' });
        const courier = await (0, courierIntegration_service_1.getCourierById)(id);
        if (!courier)
            return res.status(404).json({ status: 'error', message: 'Courier not found.' });
        res.json({ status: 'success', data: courier });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch courier.' });
    }
};
exports.getCourier = getCourier;
let token = null;
let tokenExpiry = null;
const SHIPROCKET_AUTH_TIMEOUT_MS = Number(process.env.SHIPROCKET_AUTH_TIMEOUT_MS || 10000);
const getToken = async () => {
    try {
        if (token && tokenExpiry && Date.now() < tokenExpiry)
            return token;
        const res = await axios_1.default.post(`${process.env.SHIPROCKET_API_BASE}/auth/login`, {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD,
        }, {
            timeout: SHIPROCKET_AUTH_TIMEOUT_MS,
        });
        token = res.data.token;
        tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // ~23 hours
        return token ?? '';
    }
    catch (error) {
        console.error('Shiprocket auth error:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Shiprocket');
    }
};
exports.getToken = getToken;
const fetchAvailableCouriers = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height, shipment_type, } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const userId = req.user?.sub;
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        const serviceabilityOptions = buildServiceabilityOptions(req.body);
        const serviceParams = {
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            shipment_type: shipment_type,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            freight_mode: req.body.freight_mode,
            rov_type: req.body.rov_type,
            deliveryAddress: req.body.deliveryAddress ?? req.body.delivery_address,
            ...serviceabilityOptions,
        };
        const [providerCouriers, manualCouriers] = await Promise.all([
            fetchB2CCouriersWithLocalFallback(serviceParams, userId),
            (0, manualCourier_service_1.getManualB2CRateOptions)(serviceParams, userId),
        ]);
        const couriersWithGst = await applyGstToCouriers([...(providerCouriers ?? []), ...(manualCouriers ?? [])], payment_type);
        return res.json({ success: true, data: couriersWithGst });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriers = fetchAvailableCouriers;
const fetchAvailableCouriersForGuestController = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height } = req.body;
        // Validate required fields
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'origin (pickup pincode) and destination (delivery pincode) are required',
            });
        }
        // Validate origin and destination are valid numbers
        const originNum = Number(origin);
        const destinationNum = Number(destination);
        if (isNaN(originNum) || isNaN(destinationNum)) {
            return res.status(400).json({
                success: false,
                error: 'origin and destination must be valid numbers',
            });
        }
        // Validate pincodes are 6 digits
        if (origin.toString().length !== 6 || destination.toString().length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'origin and destination must be 6-digit pincodes',
            });
        }
        // Validate weight if provided
        const weightNum = weight ? Number(weight) : undefined;
        if (weight && (isNaN(weightNum) || weightNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'weight must be a positive number',
            });
        }
        // Validate dimensions if provided
        const lengthNum = length ? Number(length) : undefined;
        const breadthNum = breadth ? Number(breadth) : undefined;
        const heightNum = height ? Number(height) : undefined;
        if (length && (isNaN(lengthNum) || lengthNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'length must be a positive number',
            });
        }
        if (breadth && (isNaN(breadthNum) || breadthNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'breadth must be a positive number',
            });
        }
        if (height && (isNaN(heightNum) || heightNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'height must be a positive number',
            });
        }
        // Validate payment_type if provided
        if (payment_type && !['cod', 'prepaid'].includes(payment_type)) {
            return res.status(400).json({
                success: false,
                error: 'payment_type must be either "cod" or "prepaid"',
            });
        }
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersForGuest)({
            origin: originNum,
            destination: destinationNum,
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            weight: weightNum,
            length: lengthNum,
            breadth: breadthNum,
            height: heightNum,
        });
        const couriersWithGst = await applyGstToCouriers(couriers ?? [], payment_type);
        return res.json({ success: true, data: couriersWithGst });
    }
    catch (err) {
        console.error('Error fetching couriers for guest:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch available couriers' });
    }
};
exports.fetchAvailableCouriersForGuestController = fetchAvailableCouriersForGuestController;
const getAvailableCouriersForUserFromBody = async (body, userId) => {
    const { origin, destination, payment_type, weight, length, breadth, height, shipment_type, } = body;
    if (!origin || !destination) {
        throw new Error('pickupPincode and deliveryPincode are required');
    }
    const serviceabilityOptions = buildServiceabilityOptions(body); // handles pickupId, reverse flags, etc.
    const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(body);
    if (orderAmountResult.invalid) {
        throw new Error('order_amount must be a non-negative number');
    }
    // Route to appropriate function based on shipment_type
    const serviceParams = {
        origin: Number(origin),
        destination: Number(destination),
        payment_type: payment_type,
        order_amount: orderAmountResult.value,
        shipment_type: shipment_type,
        weight: Number(weight),
        length: Number(length),
        breadth: Number(breadth),
        height: Number(height),
        freight_mode: body.freight_mode,
        rov_type: body.rov_type,
        pieceCount: parseOptionalNumber(body.pieceCount ?? body.piece_count ?? body.numberOfBoxes),
        deliveryAddress: body.deliveryAddress ?? body.delivery_address,
        ...serviceabilityOptions,
    };
    let couriers;
    if (shipment_type === 'b2b') {
        const [providerCouriers, manualCouriers] = await Promise.all([
            (0, shiprocket_service_1.fetchAvailableCouriersWithRatesB2B)(serviceParams, userId),
            (0, manualCourier_service_1.getManualB2BRateOptions)(serviceParams, userId),
        ]);
        couriers = [...(providerCouriers ?? []), ...(manualCouriers ?? [])];
        couriers = await applyGstToCouriers(couriers ?? [], payment_type);
    }
    else {
        const [providerCouriers, manualCouriers] = await Promise.all([
            fetchB2CCouriersWithLocalFallback(serviceParams, userId),
            (0, manualCourier_service_1.getManualB2CRateOptions)(serviceParams, userId),
        ]);
        couriers = [...(providerCouriers ?? []), ...(manualCouriers ?? [])];
        couriers = await applyGstToCouriers(couriers ?? [], payment_type);
    }
    return couriers ?? [];
};
exports.getAvailableCouriersForUserFromBody = getAvailableCouriersForUserFromBody;
const fetchAvailableCouriersToUser = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const couriers = await (0, exports.getAvailableCouriersForUserFromBody)(req.body, userId);
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriersToUser = fetchAvailableCouriersToUser;
const fetchB2BRateQuotesToUser = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const userId = req.user?.sub;
        const serviceabilityOptions = buildServiceabilityOptions(req.body);
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        const serviceParams = {
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            shipment_type: 'b2b',
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            freight_mode: req.body.freight_mode,
            rov_type: req.body.rov_type,
            pieceCount: parseOptionalNumber(req.body.pieceCount ?? req.body.piece_count ?? req.body.numberOfBoxes),
            deliveryAddress: req.body.deliveryAddress ?? req.body.delivery_address,
            ...serviceabilityOptions,
        };
        const [providerCouriers, manualCouriers] = await Promise.all([
            (0, shiprocket_service_1.fetchAvailableCouriersWithRatesB2B)(serviceParams, userId),
            (0, manualCourier_service_1.getManualB2BRateOptions)(serviceParams, userId),
        ]);
        const couriersWithGst = await applyGstToCouriers([...(providerCouriers ?? []), ...(manualCouriers ?? [])], payment_type);
        return res.json({ success: true, data: couriersWithGst ?? [] });
    }
    catch (err) {
        console.error('Error fetching B2B rate quotes:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchB2BRateQuotesToUser = fetchB2BRateQuotesToUser;
const createCourierController = async (req, res) => {
    try {
        const newCourier = await (0, courierIntegration_service_1.createCourier)(req?.body);
        res.status(201).json({ status: 'success', data: newCourier });
    }
    catch (error) {
        console.error('[createCourierController] error:', error.message);
        console.error('[createCourierController] full error:', error);
        const status = error.message.includes('Courier already exists') ? 409 : 500;
        res.status(status).json({ status: 'error', message: error.message });
    }
};
exports.createCourierController = createCourierController;
