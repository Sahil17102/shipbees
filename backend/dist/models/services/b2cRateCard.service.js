"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeEffectiveB2CCodCharge = computeEffectiveB2CCodCharge;
exports.normalizeB2CShippingMode = normalizeB2CShippingMode;
exports.normalizeB2CServiceProvider = normalizeB2CServiceProvider;
exports.normaliseRateCardSlabs = normaliseRateCardSlabs;
exports.mergeResolvedB2CRateCards = mergeResolvedB2CRateCards;
exports.validateRateCardSlabs = validateRateCardSlabs;
exports.fetchShippingRateSlabs = fetchShippingRateSlabs;
exports.fetchResolvedB2CRateCards = fetchResolvedB2CRateCards;
exports.slabContainsWeight = slabContainsWeight;
exports.findMatchingSlabIndex = findMatchingSlabIndex;
exports.formatCourierSlabDisplayName = formatCourierSlabDisplayName;
exports.computeB2CRateCardCharge = computeB2CRateCardCharge;
exports.replaceShippingRateSlabs = replaceShippingRateSlabs;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const shippingRates_1 = require("../schema/shippingRates");
const delhiveryCourier_1 = require("../../utils/delhiveryCourier");
const chargeableFreight_1 = require("./pricing/chargeableFreight");
const B2C_MIN_CHARGEABLE_WEIGHT_G = 250;
function computeEffectiveB2CCodCharge(params) {
    const fixedCharge = toNumber(params.cod_charges);
    const codPercent = toNumber(params.cod_percent);
    const orderAmount = Math.max(0, toNumber(params.order_amount));
    const percentageCharge = orderAmount > 0 && codPercent > 0 ? (orderAmount * codPercent) / 100 : 0;
    return Math.max(fixedCharge, percentageCharge);
}
function normalizeB2CShippingMode(value) {
    const raw = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!raw)
        return '';
    if (['air', 'a', 'express'].includes(raw))
        return 'air';
    if (['surface', 's', 'ground'].includes(raw))
        return 'surface';
    return raw;
}
function normalizeB2CServiceProvider(value) {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
    if (['xpressbess', 'xpressbee', 'xpress bees'].includes(normalized)) {
        return 'xpressbees';
    }
    return normalized;
}
function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
const DELHIVERY_B2C_COURIER_IDS = new Set([99, 100, 1, 92, 93]);
function inferB2CServiceProvider(row) {
    const explicitProvider = normalizeB2CServiceProvider(row.service_provider);
    if (explicitProvider)
        return explicitProvider;
    const courierName = String(row.courier_name || '').toLowerCase();
    const courierId = toNumber(row.courier_id, NaN);
    if (courierName.includes('delhivery') || DELHIVERY_B2C_COURIER_IDS.has(courierId)) {
        return 'delhivery';
    }
    if (courierName.includes('amazon'))
        return 'amazon';
    if (courierName.includes('ekart'))
        return 'ekart';
    if (courierName.includes('shadowfax'))
        return 'shadowfax';
    if (courierName.includes('xpress'))
        return 'xpressbees';
    return '';
}
const getCanonicalDelhiveryRateMeta = (row) => {
    const shippingMode = (0, delhiveryCourier_1.resolveDelhiveryRateCardShippingMode)({
        courierId: row.courier_id,
        mode: row.mode,
        courierName: row.courier_name,
    });
    const courierId = (0, delhiveryCourier_1.getCanonicalDelhiveryCourierIdByMode)(shippingMode);
    return shippingMode && courierId
        ? {
            courierId,
            courierName: (0, delhiveryCourier_1.getDelhiveryCourierDisplayName)(shippingMode),
            mode: shippingMode === 'Express' ? 'air' : 'surface',
        }
        : null;
};
function normaliseSlabInput(slab) {
    const weightFrom = Math.max(0, toNumber(slab.weight_from));
    const rawWeightTo = slab.weight_to === undefined || slab.weight_to === null ? null : toNumber(slab.weight_to);
    const weightTo = rawWeightTo !== null && rawWeightTo < weightFrom ? weightFrom : rawWeightTo;
    const extraWeightUnitRaw = slab.extra_weight_unit === undefined || slab.extra_weight_unit === null
        ? null
        : toNumber(slab.extra_weight_unit);
    const extraWeightUnit = extraWeightUnitRaw !== null && extraWeightUnitRaw > 0 ? extraWeightUnitRaw : null;
    const extraRateRaw = slab.extra_rate === undefined || slab.extra_rate === null ? null : toNumber(slab.extra_rate);
    const extraRate = extraRateRaw !== null && extraRateRaw > 0 ? extraRateRaw : null;
    return {
        weight_from: weightFrom,
        weight_to: weightTo,
        rate: toNumber(slab.rate),
        extra_rate: extraRate,
        extra_weight_unit: extraWeightUnit,
    };
}
function normaliseRateCardSlabs(slabs = []) {
    return slabs
        .map(normaliseSlabInput)
        .filter((slab) => slab.rate > 0)
        .sort((a, b) => a.weight_from - b.weight_from || (a.weight_to ?? Infinity) - (b.weight_to ?? Infinity));
}
const slabWeightsMatch = (left, right) => Math.abs(left - right) < 0.0001;
const slabWeightToMatches = (left, right) => left === null || right === null
    ? left === right
    : slabWeightsMatch(left, right);
const slabEnd = (slab) => slab.weight_to ?? Infinity;
const slabRangeKey = (slab) => `${slab.weight_from}|${slab.weight_to ?? 'open'}`;
const sortSlabsByRange = (slabs) => slabs.sort((a, b) => a.weight_from - b.weight_from || slabEnd(a) - slabEnd(b));
const mergeResolvedSlabs = (current = [], incoming = []) => {
    const byRange = new Map();
    for (const slab of current) {
        byRange.set(slabRangeKey(slab), slab);
    }
    for (const slab of incoming) {
        byRange.set(slabRangeKey(slab), slab);
    }
    return sortSlabsByRange(Array.from(byRange.values()));
};
const buildLegacyRateRowSlab = (row) => {
    const weightTo = toNumber(row.min_weight);
    const rate = toNumber(row.rate);
    if (weightTo <= 0 || rate <= 0)
        return [];
    return [
        {
            weight_from: 0,
            weight_to: weightTo,
            rate,
            extra_rate: null,
            extra_weight_unit: null,
        },
    ];
};
function mergeResolvedB2CRateCards(rateCards = [], options = {}) {
    const requestedServiceProvider = normalizeB2CServiceProvider(options.serviceProvider);
    const merged = new Map();
    for (const rateCard of rateCards) {
        const rowServiceProvider = normalizeB2CServiceProvider(rateCard.service_provider);
        const effectiveServiceProvider = requestedServiceProvider && !rowServiceProvider
            ? requestedServiceProvider
            : rowServiceProvider;
        const key = [
            rateCard.courier_id,
            effectiveServiceProvider,
            rateCard.zone_id,
            normalizeB2CShippingMode(rateCard.mode),
            rateCard.type,
        ].join('|');
        const normalizedCard = {
            ...rateCard,
            service_provider: rateCard.service_provider || requestedServiceProvider || null,
        };
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, normalizedCard);
            continue;
        }
        const preferCurrentMetadata = Boolean(rowServiceProvider) || !normalizeB2CServiceProvider(existing.service_provider);
        merged.set(key, {
            ...(preferCurrentMetadata ? normalizedCard : existing),
            slabs: mergeResolvedSlabs(existing.slabs, normalizedCard.slabs),
        });
    }
    return Array.from(merged.values());
}
const slabRangesOverlap = (left, right) => left.weight_from < slabEnd(right) && right.weight_from < slabEnd(left);
const slabContainsRange = (outer, inner) => outer.weight_from <= inner.weight_from && slabEnd(outer) >= slabEnd(inner);
function validateRateCardSlabs(slabs) {
    for (let index = 0; index < slabs.length; index += 1) {
        const slab = slabs[index];
        if (slab.weight_to !== null && slab.weight_to < slab.weight_from) {
            throw new Error(`Invalid slab range at row ${index + 1}: weight_to cannot be less than weight_from`);
        }
        if (slab.extra_rate !== null && slab.extra_weight_unit === null) {
            throw new Error(`Invalid slab at row ${index + 1}: extra_weight_unit is required when extra_rate is set`);
        }
        if (slab.extra_weight_unit !== null && slab.extra_rate === null) {
            throw new Error(`Invalid slab at row ${index + 1}: extra_rate is required when extra_weight_unit is set`);
        }
        if (slab.weight_to === null && index !== slabs.length - 1) {
            throw new Error(`Invalid slab configuration: open-ended slab at row ${index + 1} must be the last slab`);
        }
    }
    for (let outerIndex = 0; outerIndex < slabs.length; outerIndex += 1) {
        const current = slabs[outerIndex];
        for (let innerIndex = outerIndex + 1; innerIndex < slabs.length; innerIndex += 1) {
            const next = slabs[innerIndex];
            if (slabWeightsMatch(current.weight_from, next.weight_from) &&
                slabWeightToMatches(current.weight_to, next.weight_to)) {
                throw new Error(`Duplicate slab ranges are not allowed: ${next.weight_from}-${next.weight_to ?? 'open'}`);
            }
            if (!slabRangesOverlap(current, next))
                continue;
            const nested = slabContainsRange(current, next) ||
                slabContainsRange(next, current);
            if (nested) {
                continue;
            }
            throw new Error(`Overlapping slab ranges are not allowed: ${current.weight_from}-${current.weight_to ?? 'open'} overlaps ${next.weight_from}-${next.weight_to ?? 'open'}`);
        }
    }
}
async function fetchShippingRateSlabs(rateIds) {
    if (!rateIds.length)
        return [];
    return client_1.db
        .select()
        .from(shippingRates_1.shippingRateSlabs)
        .where((0, drizzle_orm_1.inArray)(shippingRates_1.shippingRateSlabs.shipping_rate_id, rateIds))
        .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.shipping_rate_id), (0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.weight_from), (0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.weight_to));
}
async function fetchResolvedB2CRateCards(filters) {
    const requestedServiceProvider = normalizeB2CServiceProvider(filters.serviceProvider);
    const requestedMode = normalizeB2CShippingMode(filters.mode);
    const isDelhiveryModeScopedRequest = requestedServiceProvider === 'delhivery' && Boolean(requestedMode);
    const conditions = [
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, filters.planId),
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'),
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, filters.zoneId),
    ];
    if (filters.shippingRateId) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.id, filters.shippingRateId));
    }
    if (filters.courierId !== undefined && !isDelhiveryModeScopedRequest) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, filters.courierId));
    }
    if (filters.type) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, filters.type));
    }
    const allRateRows = await client_1.db
        .select()
        .from(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRates.last_updated));
    const providerFilteredRows = requestedServiceProvider
        ? (() => {
            const exactProviderRows = allRateRows.filter((row) => inferB2CServiceProvider(row) === requestedServiceProvider);
            const legacyProviderRows = allRateRows.filter((row) => !inferB2CServiceProvider(row));
            if (exactProviderRows.length)
                return [...legacyProviderRows, ...exactProviderRows];
            return legacyProviderRows;
        })()
        : allRateRows;
    const rateRows = requestedMode
        ? (() => {
            const exactModeRows = providerFilteredRows.filter((row) => normalizeB2CShippingMode(inferB2CServiceProvider(row) === 'delhivery'
                ? getCanonicalDelhiveryRateMeta(row)?.mode ?? row.mode
                : row.mode) === requestedMode);
            if (exactModeRows.length)
                return exactModeRows;
            return providerFilteredRows.filter((row) => !normalizeB2CShippingMode(inferB2CServiceProvider(row) === 'delhivery'
                ? getCanonicalDelhiveryRateMeta(row)?.mode ?? row.mode
                : row.mode));
        })()
        : providerFilteredRows;
    const slabs = await fetchShippingRateSlabs(rateRows.map((row) => row.id));
    const slabMap = new Map();
    for (const slab of slabs) {
        const list = slabMap.get(slab.shipping_rate_id) || [];
        list.push({
            id: slab.id,
            weight_from: toNumber(slab.weight_from),
            weight_to: slab.weight_to === null ? null : toNumber(slab.weight_to),
            rate: toNumber(slab.rate),
            extra_rate: slab.extra_rate === null ? null : toNumber(slab.extra_rate),
            extra_weight_unit: slab.extra_weight_unit === null ? null : toNumber(slab.extra_weight_unit),
        });
        slabMap.set(slab.shipping_rate_id, list);
    }
    const makeRateRowMergeKey = (row) => {
        const provider = inferB2CServiceProvider(row);
        const canonicalDelhivery = provider === 'delhivery' ? getCanonicalDelhiveryRateMeta(row) : null;
        return [
            canonicalDelhivery?.courierId ?? row.courier_id,
            provider,
            row.zone_id,
            normalizeB2CShippingMode(canonicalDelhivery?.mode ?? row.mode),
            row.type,
        ].join('|');
    };
    const rateRowsPerMergeKey = new Map();
    for (const row of rateRows) {
        const key = makeRateRowMergeKey(row);
        rateRowsPerMergeKey.set(key, (rateRowsPerMergeKey.get(key) || 0) + 1);
    }
    const merged = new Map();
    for (const row of rateRows) {
        const key = makeRateRowMergeKey(row);
        const explicitRowSlabs = slabMap.get(row.id) || [];
        const rowSlabs = explicitRowSlabs.length
            ? explicitRowSlabs
            : (rateRowsPerMergeKey.get(key) || 0) > 1
                ? buildLegacyRateRowSlab(row)
                : [];
        const existing = merged.get(key);
        const provider = inferB2CServiceProvider(row);
        const canonicalDelhivery = provider === 'delhivery' ? getCanonicalDelhiveryRateMeta(row) : null;
        const nextCard = {
            shippingRateId: row.id,
            courier_id: canonicalDelhivery?.courierId ?? row.courier_id,
            courier_name: canonicalDelhivery?.courierName ?? row.courier_name,
            service_provider: row.service_provider || provider || null,
            zone_id: row.zone_id,
            type: row.type,
            mode: canonicalDelhivery?.mode ?? row.mode,
            cod_charges: toNumber(row.cod_charges),
            cod_percent: toNumber(row.cod_percent),
            other_charges: toNumber(row.other_charges),
            min_weight: toNumber(row.min_weight),
            base_rate: toNumber(row.rate),
            slabs: rowSlabs,
        };
        if (!existing) {
            merged.set(key, nextCard);
            continue;
        }
        merged.set(key, {
            ...nextCard,
            slabs: mergeResolvedSlabs(existing.slabs, rowSlabs),
        });
    }
    return mergeResolvedB2CRateCards(Array.from(merged.values()), {
        serviceProvider: requestedServiceProvider,
    });
}
function slabContainsWeight(chargeableWeightKg, slab, slabIndex) {
    const start = slab.weight_from;
    const end = slab.weight_to ?? Infinity;
    const lowerBoundMatches = slabIndex === 0 ? chargeableWeightKg >= start : chargeableWeightKg > start;
    return lowerBoundMatches && chargeableWeightKg <= end;
}
function findMatchingSlabIndex(chargeableWeightG, slabs) {
    const chargeableWeightKg = chargeableWeightG / 1000;
    let bestIndex = -1;
    let bestSpan = Infinity;
    let bestEnd = Infinity;
    slabs.forEach((slab, index) => {
        if (!slabContainsWeight(chargeableWeightKg, slab, index))
            return;
        const currentEnd = slabEnd(slab);
        const currentSpan = currentEnd - slab.weight_from;
        if (currentSpan < bestSpan || (currentSpan === bestSpan && currentEnd < bestEnd)) {
            bestIndex = index;
            bestSpan = currentSpan;
            bestEnd = currentEnd;
        }
    });
    return bestIndex;
}
function findMatchingSlab(chargeableWeightG, slabs) {
    const matchingIndex = findMatchingSlabIndex(chargeableWeightG, slabs);
    return matchingIndex >= 0 ? slabs[matchingIndex] : null;
}
const slabHasAdditionalRate = (slab) => slab.extra_rate !== null && slab.extra_weight_unit !== null && slab.extra_weight_unit > 0;
function findExactThresholdSlab(chargeableWeightKg, slabs) {
    const matches = slabs.filter((slab) => slab.weight_to !== null && slabWeightsMatch(slab.weight_to, chargeableWeightKg));
    return (matches.sort((a, b) => slabEnd(a) - a.weight_from - (slabEnd(b) - b.weight_from) ||
        b.weight_from - a.weight_from)[0] || null);
}
function findContainingRangeSlab(chargeableWeightG, slabs) {
    const chargeableWeightKg = chargeableWeightG / 1000;
    let selected = null;
    let selectedSpan = Infinity;
    let selectedEnd = Infinity;
    slabs.forEach((slab, index) => {
        if (slab.weight_from <= 0)
            return;
        if (!slabContainsWeight(chargeableWeightKg, slab, index))
            return;
        const currentEnd = slabEnd(slab);
        const currentSpan = currentEnd - slab.weight_from;
        if (currentSpan < selectedSpan || (currentSpan === selectedSpan && currentEnd < selectedEnd)) {
            selected = slab;
            selectedSpan = currentSpan;
            selectedEnd = currentEnd;
        }
    });
    return selected;
}
function findSmallestCoveringFiniteSlab(chargeableWeightG, slabs) {
    const chargeableWeightKg = chargeableWeightG / 1000;
    const candidates = slabs.filter((slab) => slab.weight_to !== null && slab.weight_to + 0.0001 >= chargeableWeightKg);
    return (candidates.sort((a, b) => slabEnd(a) - slabEnd(b) ||
        slabEnd(a) - a.weight_from - (slabEnd(b) - b.weight_from) ||
        b.weight_from - a.weight_from)[0] || null);
}
function calculateChargeableWeight(params) {
    return (0, chargeableFreight_1.calculateFreight)({
        actual_weight_g: params.actual_weight_g,
        length_cm: params.length_cm,
        width_cm: params.width_cm,
        height_cm: params.height_cm,
        slab_weight_g: 1,
        base_price: 0,
    });
}
function getLastFiniteSlab(slabs) {
    let selected = null;
    for (const slab of slabs) {
        if (slab.weight_to === null)
            continue;
        if (!selected ||
            selected.weight_to === null ||
            slab.weight_to > selected.weight_to ||
            (slab.weight_to === selected.weight_to && slab.weight_from > selected.weight_from)) {
            selected = slab;
        }
    }
    return selected;
}
function calculateSlabExtraFreight(chargeableWeightKg, slab) {
    if (slab.weight_to === null ||
        chargeableWeightKg <= slab.weight_to ||
        !slabHasAdditionalRate(slab)) {
        return null;
    }
    const extraWeightKg = Math.max(0, chargeableWeightKg - slab.weight_to);
    const extraUnits = Math.ceil(Math.max(0, extraWeightKg - 0.0000001) / slab.extra_weight_unit);
    return {
        freight: slab.rate + extraUnits * slab.extra_rate,
        slab_weight: slab.extra_weight_unit * 1000,
    };
}
function findPreviousAdditionalSlab(chargeableWeightKg, slabs) {
    let selected = null;
    for (const slab of slabs) {
        if (slab.weight_to === null || chargeableWeightKg <= slab.weight_to || !slabHasAdditionalRate(slab)) {
            continue;
        }
        if (!selected ||
            selected.weight_to === null ||
            slab.weight_to > selected.weight_to ||
            (slab.weight_to === selected.weight_to && slab.weight_from > selected.weight_from)) {
            selected = slab;
        }
    }
    return selected;
}
function buildComputedSlabCharge(preview, slab, freight, slabWeight, matchedBy) {
    return {
        actual_weight: preview.actual_weight,
        volumetric_weight: preview.volumetric_weight,
        chargeable_weight: preview.chargeable_weight,
        slabs: null,
        freight,
        slab_weight: slabWeight,
        base_price: slab.rate,
        selected_slab: slab,
        max_slab_weight: slab.weight_to,
        matched_by: matchedBy,
    };
}
function formatCourierSlabDisplayName(courierName, slabWeightTo) {
    if (slabWeightTo === null || slabWeightTo === undefined || !Number.isFinite(Number(slabWeightTo))) {
        return courierName;
    }
    return `${courierName} - (${Number(slabWeightTo)}) kg`;
}
function computeB2CRateCardCharge(params) {
    const preview = calculateChargeableWeight({
        actual_weight_g: params.actual_weight_g,
        length_cm: params.length_cm,
        width_cm: params.width_cm,
        height_cm: params.height_cm,
    });
    const ratedPreview = {
        ...preview,
        chargeable_weight: Math.max(preview.chargeable_weight, B2C_MIN_CHARGEABLE_WEIGHT_G),
    };
    if (!params.rateCard.slabs.length) {
        const legacy = (0, chargeableFreight_1.calculateFreight)({
            actual_weight_g: params.actual_weight_g,
            length_cm: params.length_cm,
            width_cm: params.width_cm,
            height_cm: params.height_cm,
            slab_weight_g: Math.max(1, params.rateCard.min_weight * 1000 || 1),
            base_price: params.rateCard.base_rate,
        });
        return {
            ...legacy,
            chargeable_weight: Math.max(legacy.chargeable_weight, B2C_MIN_CHARGEABLE_WEIGHT_G),
            slab_weight: params.rateCard.min_weight ? params.rateCard.min_weight * 1000 : null,
            base_price: params.rateCard.base_rate,
            selected_slab: null,
            max_slab_weight: params.rateCard.min_weight || null,
            matched_by: 'legacy',
        };
    }
    const chargeableWeightKg = ratedPreview.chargeable_weight / 1000;
    const selectedMaxSlabWeight = params.selected_max_slab_weight === undefined || params.selected_max_slab_weight === null
        ? null
        : toNumber(params.selected_max_slab_weight);
    const lastFiniteSlab = getLastFiniteSlab(params.rateCard.slabs);
    if (selectedMaxSlabWeight !== null) {
        const explicitlySelectedSlab = params.rateCard.slabs.find((slab) => slab.weight_to !== null &&
            Math.abs(Number(slab.weight_to) - Number(selectedMaxSlabWeight)) < 0.0001) || null;
        if (explicitlySelectedSlab) {
            if (explicitlySelectedSlab.weight_to !== null &&
                chargeableWeightKg <= explicitlySelectedSlab.weight_to) {
                return {
                    actual_weight: preview.actual_weight,
                    volumetric_weight: preview.volumetric_weight,
                    chargeable_weight: ratedPreview.chargeable_weight,
                    slabs: null,
                    freight: explicitlySelectedSlab.rate,
                    slab_weight: null,
                    base_price: explicitlySelectedSlab.rate,
                    selected_slab: explicitlySelectedSlab,
                    max_slab_weight: explicitlySelectedSlab.weight_to,
                    matched_by: 'slab',
                };
            }
            const selectedSlabExtra = calculateSlabExtraFreight(chargeableWeightKg, explicitlySelectedSlab);
            if (selectedSlabExtra) {
                return {
                    actual_weight: preview.actual_weight,
                    volumetric_weight: preview.volumetric_weight,
                    chargeable_weight: ratedPreview.chargeable_weight,
                    slabs: null,
                    freight: selectedSlabExtra.freight,
                    slab_weight: selectedSlabExtra.slab_weight,
                    base_price: explicitlySelectedSlab.rate,
                    selected_slab: explicitlySelectedSlab,
                    max_slab_weight: explicitlySelectedSlab.weight_to,
                    matched_by: 'last_slab_extra',
                };
            }
        }
    }
    const exactThresholdSlab = findExactThresholdSlab(chargeableWeightKg, params.rateCard.slabs);
    if (exactThresholdSlab) {
        return buildComputedSlabCharge(ratedPreview, exactThresholdSlab, exactThresholdSlab.rate, null, 'slab');
    }
    const previousAdditionalSlab = findPreviousAdditionalSlab(chargeableWeightKg, params.rateCard.slabs);
    const previousAdditionalFreight = previousAdditionalSlab
        ? calculateSlabExtraFreight(chargeableWeightKg, previousAdditionalSlab)
        : null;
    if (previousAdditionalSlab && previousAdditionalFreight) {
        return buildComputedSlabCharge(ratedPreview, previousAdditionalSlab, previousAdditionalFreight.freight, previousAdditionalFreight.slab_weight, 'last_slab_extra');
    }
    const containingRangeSlab = findContainingRangeSlab(ratedPreview.chargeable_weight, params.rateCard.slabs);
    if (containingRangeSlab) {
        return buildComputedSlabCharge(ratedPreview, containingRangeSlab, containingRangeSlab.rate, null, 'slab');
    }
    const coveringSlab = findSmallestCoveringFiniteSlab(ratedPreview.chargeable_weight, params.rateCard.slabs);
    if (coveringSlab) {
        return buildComputedSlabCharge(ratedPreview, coveringSlab, coveringSlab.rate, null, 'slab');
    }
    const selectedSlab = findMatchingSlab(ratedPreview.chargeable_weight, params.rateCard.slabs);
    if (selectedSlab) {
        return buildComputedSlabCharge(ratedPreview, selectedSlab, selectedSlab.rate, null, 'slab');
    }
    const lastSlabExtra = lastFiniteSlab ? calculateSlabExtraFreight(chargeableWeightKg, lastFiniteSlab) : null;
    if (lastFiniteSlab && lastSlabExtra) {
        return buildComputedSlabCharge(ratedPreview, lastFiniteSlab, lastSlabExtra.freight, lastSlabExtra.slab_weight, 'last_slab_extra');
    }
    return {
        actual_weight: preview.actual_weight,
        volumetric_weight: preview.volumetric_weight,
        chargeable_weight: ratedPreview.chargeable_weight,
        slabs: null,
        freight: 0,
        slab_weight: null,
        base_price: 0,
        selected_slab: null,
        max_slab_weight: null,
        matched_by: 'slab',
    };
}
async function replaceShippingRateSlabs(shippingRateId, slabs) {
    const normalised = normaliseRateCardSlabs(slabs);
    validateRateCardSlabs(normalised);
    await client_1.db.delete(shippingRates_1.shippingRateSlabs).where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRateSlabs.shipping_rate_id, shippingRateId));
    if (!normalised.length)
        return;
    await client_1.db.insert(shippingRates_1.shippingRateSlabs).values(normalised.map((slab) => ({
        shipping_rate_id: shippingRateId,
        weight_from: slab.weight_from.toFixed(3),
        weight_to: slab.weight_to === null ? null : slab.weight_to.toFixed(3),
        rate: slab.rate.toFixed(2),
        extra_rate: slab.extra_rate === null ? null : slab.extra_rate.toFixed(2),
        extra_weight_unit: slab.extra_weight_unit === null ? null : slab.extra_weight_unit.toFixed(3),
        updated_at: new Date(),
    })));
}
