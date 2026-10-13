"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendReversePickupTags = exports.getReverseOriginalOrderTag = exports.REVERSE_PICKUP_ORIGINAL_TAG_PREFIX = exports.REVERSE_PICKUP_TAG = void 0;
exports.findExistingReversePickup = findExistingReversePickup;
exports.getOriginalOrderForReversePickup = getOriginalOrderForReversePickup;
exports.assertReversePickupAllowed = assertReversePickupAllowed;
exports.quoteReverseForOrder = quoteReverseForOrder;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const couriers_1 = require("../schema/couriers");
const locations_1 = require("../schema/locations");
const zones_1 = require("../schema/zones");
const b2cRateCard_service_1 = require("./b2cRateCard.service");
const plan_service_1 = require("./plan.service");
// Weight slab logic removed
exports.REVERSE_PICKUP_TAG = 'reverse_pickup';
exports.REVERSE_PICKUP_ORIGINAL_TAG_PREFIX = 'reverse_original_id=';
const REVERSE_PICKUP_SUPPORTED_PROVIDERS = new Set([
    'delhivery',
    'shadowfax',
    'xpressbees',
    'ekart',
    'amazon',
]);
const normalizeText = (value) => String(value ?? '').trim();
const normalizeLower = (value) => normalizeText(value).toLowerCase();
const getReverseOriginalOrderTag = (orderId) => `${exports.REVERSE_PICKUP_ORIGINAL_TAG_PREFIX}${normalizeText(orderId)}`;
exports.getReverseOriginalOrderTag = getReverseOriginalOrderTag;
const appendReversePickupTags = (existingTags, originalOrderId) => {
    const tagParts = String(existingTags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
    for (const tag of [exports.REVERSE_PICKUP_TAG, (0, exports.getReverseOriginalOrderTag)(originalOrderId)]) {
        if (!tagParts.some((part) => part.toLowerCase() === tag.toLowerCase())) {
            tagParts.push(tag);
        }
    }
    return tagParts.join(',');
};
exports.appendReversePickupTags = appendReversePickupTags;
async function findExistingReversePickup(userId, originalOrderId, originalOrderNumber) {
    const marker = `%${(0, exports.getReverseOriginalOrderTag)(originalOrderId)}%`;
    const originalOrderNumberPattern = normalizeText(originalOrderNumber)
        ? `${normalizeText(originalOrderNumber)}-R%`
        : '';
    const [existing] = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        order_status: b2cOrders_1.b2c_orders.order_status,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_type, 'reverse'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.sql) `COALESCE(${b2cOrders_1.b2c_orders.tags}, '') ILIKE ${marker}`, originalOrderNumberPattern
        ? (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_number} ILIKE ${originalOrderNumberPattern}`
        : (0, drizzle_orm_1.sql) `false`), (0, drizzle_orm_1.sql) `lower(COALESCE(${b2cOrders_1.b2c_orders.order_status}, '')) NOT IN ('cancelled', 'cancellation_requested')`))
        .limit(1);
    return existing ?? null;
}
async function getOriginalOrderForReversePickup(orderId, userId) {
    const conditions = [(0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)];
    if (userId)
        conditions.push((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId));
    const [order] = await client_1.db
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)(...conditions))
        .limit(1);
    return order ?? null;
}
async function assertReversePickupAllowed(orderId, userId) {
    const order = await getOriginalOrderForReversePickup(orderId, userId);
    if (!order) {
        throw new Error('Original order not found');
    }
    if (normalizeLower(order.order_type) === 'reverse') {
        throw new Error('Reverse pickup cannot be created from another reverse pickup order');
    }
    if (normalizeLower(order.order_status) !== 'delivered') {
        throw new Error('Reverse pickup can be created only for delivered B2C orders');
    }
    const provider = normalizeLower(order.integration_type);
    if (!REVERSE_PICKUP_SUPPORTED_PROVIDERS.has(provider)) {
        throw new Error(`Reverse pickup is not supported for ${normalizeText(order.integration_type) || 'this courier'}`);
    }
    const existing = await findExistingReversePickup(userId, orderId, order.order_number);
    if (existing) {
        throw new Error(`Reverse pickup already exists for this order (${existing.order_number})`);
    }
    return order;
}
function normalizeTags(tags) {
    if (Array.isArray(tags))
        return tags.map((t) => String(t).toLowerCase());
    return [];
}
async function fetchLocationByPincode(pincode) {
    const rows = await client_1.db
        .select({
        id: locations_1.locations.id,
        pincode: locations_1.locations.pincode,
        city: locations_1.locations.city,
        state: locations_1.locations.state,
        country: locations_1.locations.country,
        tags: locations_1.locations.tags,
    })
        .from(locations_1.locations)
        .where((0, drizzle_orm_1.eq)(locations_1.locations.pincode, pincode))
        .limit(1);
    const row = rows[0];
    if (!row)
        return null;
    return { ...row, tags: normalizeTags(row.tags) };
}
const hasTag = (loc, tag) => !!loc && Array.isArray(loc.tags) && loc.tags.includes(tag.toLowerCase());
const ZONE_KEY_TO_DB_CODE = {
    METRO_TO_METRO: 'METRO_TO_METRO',
    ROI: 'ROI',
    SPECIAL_ZONE: 'SPECIAL_ZONE',
    WITHIN_CITY: 'WITHIN_CITY',
    WITHIN_REGION: 'WITHIN_REGION',
    WITHIN_STATE: 'WITHIN_STATE',
};
function determineB2CZoneKey(origin, destination) {
    if (!origin || !destination) {
        return { key: 'ROI', reason: 'origin or destination missing' };
    }
    if (hasTag(origin, 'special_zones') ||
        hasTag(origin, 'special_zone') ||
        hasTag(destination, 'special_zones') ||
        hasTag(destination, 'special_zone') ||
        hasTag(origin, 'special') ||
        hasTag(destination, 'special')) {
        return { key: 'SPECIAL_ZONE', reason: 'special zone tag present' };
    }
    if (origin.city &&
        destination.city &&
        origin.state &&
        destination.state &&
        (origin.city ?? '').toLowerCase() === (destination.city ?? '').toLowerCase() &&
        (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase()) {
        return { key: 'WITHIN_CITY', reason: 'same city + same state' };
    }
    if (origin.state &&
        destination.state &&
        (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase() &&
        (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()) {
        return { key: 'WITHIN_STATE', reason: 'same state (different city)' };
    }
    if (hasTag(origin, 'metros') &&
        hasTag(destination, 'metros') &&
        (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()) {
        return { key: 'METRO_TO_METRO', reason: 'both metros (different cities, cross-state allowed)' };
    }
    const regions = ['north', 'south', 'east', 'west'];
    for (const r of regions) {
        if (hasTag(origin, r) && hasTag(destination, r)) {
            return { key: 'WITHIN_REGION', reason: `both in region ${r}` };
        }
    }
    return { key: 'ROI', reason: 'fallback Rest of India' };
}
async function fetchZoneIdByKey(key) {
    const dbCodeRaw = ZONE_KEY_TO_DB_CODE[key] ?? ZONE_KEY_TO_DB_CODE['ROI'];
    const dbCode = dbCodeRaw?.trim();
    if (!dbCode)
        throw new Error('fetchZoneIdByKey called with empty dbCode');
    const exactTrim = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2C'), (0, drizzle_orm_1.sql) `trim(${zones_1.zones.code}) = ${dbCode}`))
        .limit(1);
    if (exactTrim?.[0]?.id)
        return { id: exactTrim[0].id, code: exactTrim[0].code, name: exactTrim[0].name };
    const ci = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2C'), (0, drizzle_orm_1.sql) `lower(trim(${zones_1.zones.code})) = ${dbCode.toLowerCase()}`))
        .limit(1);
    if (ci?.[0]?.id)
        return { id: ci[0].id, code: ci[0].code, name: ci[0].name };
    const nameMatch = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2C'), (0, drizzle_orm_1.sql) `lower(trim(${zones_1.zones.name})) = ${dbCode.toLowerCase()}`))
        .limit(1);
    if (nameMatch?.[0]?.id)
        return { id: nameMatch[0].id, code: nameMatch[0].code, name: nameMatch[0].name };
    const roiKeyLower = (ZONE_KEY_TO_DB_CODE['ROI'] ?? 'ROI').toLowerCase().trim();
    const fallback = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2C'), (0, drizzle_orm_1.sql) `(lower(trim(${zones_1.zones.code})) = ${roiKeyLower} OR lower(trim(${zones_1.zones.name})) = ${roiKeyLower})`))
        .limit(1);
    if (fallback?.[0]?.id)
        return { id: fallback[0].id, code: fallback[0].code, name: fallback[0].name };
    throw new Error('Zone lookup failed: ROI zone missing');
}
const normalizeOrderWeightToGrams = (value, fallback = 500) => {
    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0)
        return fallback;
    return Math.max(1, numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000));
};
async function quoteReverseForOrder(orderId, _overrideWeightGrams, userId) {
    // 1) Fetch order and resolve courier
    const order = await getOriginalOrderForReversePickup(orderId, userId);
    if (!order)
        throw new Error('Order not found');
    // Always trust server-stored order weight; ignore any client override
    const weightGrams = normalizeOrderWeightToGrams(order.weight);
    const reverseDestPincode = order?.pickup_details?.pincode || order.pincode;
    let resolvedCourierId = order.courier_id ? Number(order.courier_id) : undefined;
    if (!resolvedCourierId) {
        const partnerName = (order.courier_partner || '').trim();
        const provider = (order.integration_type || '').trim();
        if (partnerName && provider) {
            const [c] = await client_1.db
                .select({ id: couriers_1.couriers.id })
                .from(couriers_1.couriers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, provider), (0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true), (0, drizzle_orm_1.sql) `${couriers_1.couriers.name} ILIKE ${'%' + partnerName + '%'}`))
                .limit(1);
            if (c?.id)
                resolvedCourierId = Number(c.id);
        }
    }
    if (!resolvedCourierId)
        throw new Error('Courier not associated with the order');
    // 2) Determine zone (origin = consignee, destination = original pickup)
    const [originLoc, destLoc] = await Promise.all([
        order.pincode ? fetchLocationByPincode(order.pincode) : Promise.resolve(null),
        reverseDestPincode ? fetchLocationByPincode(reverseDestPincode) : Promise.resolve(null),
    ]);
    const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc);
    const zoneRow = await fetchZoneIdByKey(zoneKey);
    // 3) Fetch user plan (no slab)
    const planId = await (0, plan_service_1.getUserPlanId)(String(order.user_id), 'b2c');
    const provider = (order.integration_type || '').toLowerCase().trim();
    let rates = planId
        ? await (0, b2cRateCard_service_1.fetchResolvedB2CRateCards)({
            planId,
            zoneId: zoneRow.id,
            courierId: resolvedCourierId,
            serviceProvider: provider || null,
            mode: order.shipping_mode ?? null,
            type: 'rto',
        })
        : [];
    if (!rates?.length) {
        console.warn('[ReverseQuote] No RTO rows for zone=%s provider=%s plan=%s', zoneRow.code, provider, planId || 'none');
        throw new Error('No reverse rate available for this zone/weight');
    }
    const selected = rates[0];
    const quote = (0, b2cRateCard_service_1.computeB2CRateCardCharge)({
        actual_weight_g: weightGrams,
        length_cm: Number(order.length ?? 0),
        width_cm: Number(order.breadth ?? 0),
        height_cm: Number(order.height ?? 0),
        rateCard: selected,
        selected_max_slab_weight: order.selected_max_slab_weight ?? null,
    });
    if (selected.slabs.length && quote.freight <= 0) {
        throw new Error('No reverse rate available for this zone/weight');
    }
    const rate = Number(quote.freight);
    const zoneCode = (zoneRow.code || '').toUpperCase();
    const eddDays = zoneCode === 'A' ? 2 : zoneCode === 'B' ? 3 : zoneCode === 'C' ? 4 : zoneCode === 'D' ? 5 : 6;
    const tagsArray = Array.isArray(destLoc?.tags) ? destLoc.tags : [];
    const oda = tagsArray.map((t) => String(t).toLowerCase()).includes('oda');
    return {
        rate,
        currency: 'INR',
        weightGrams,
        zoneId: zoneRow.id,
        zoneCode,
        courierId: resolvedCourierId,
        max_slab_weight: quote.max_slab_weight ?? null,
        oda,
        eddDays,
    };
}
