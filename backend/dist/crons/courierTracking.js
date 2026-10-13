"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollCourierTracking = pollCourierTracking;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const supportedTrackingProviders = [
    'delhivery',
    'shadowfax',
    'amazon',
    'xpressbees',
    'ekart',
    'indiapost',
];
const terminalStatuses = ['delivered', 'cancelled', 'rto_delivered', 'lost'];
const normalizeBatchSize = (batchSize) => Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 50;
const normalizeProvider = (value) => {
    const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
    if (normalized === 'xpressbees' || normalized === 'xpressbeeslogistics')
        return 'xpressbees';
    if (normalized === 'xpressbeeslogistic')
        return 'xpressbees';
    if (normalized === 'amazonshipping')
        return 'amazon';
    if (normalized === 'indiapost' || normalized === 'speedpost')
        return 'indiapost';
    return supportedTrackingProviders.find((provider) => provider === normalized) || null;
};
const parseProviderFilter = (providers) => {
    const parsed = (providers || [])
        .map(normalizeProvider)
        .filter((provider) => Boolean(provider));
    return parsed.length ? Array.from(new Set(parsed)) : [...supportedTrackingProviders];
};
const courierPartnerNeedle = (provider) => {
    if (provider === 'xpressbees')
        return 'xpress';
    if (provider === 'amazon')
        return 'amazon';
    if (provider === 'indiapost')
        return 'india post';
    return provider;
};
const providerScope = (table, providers) => (0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(table.integration_type, providers), ...providers.map((provider) => (0, drizzle_orm_1.ilike)(table.courier_partner, `%${courierPartnerNeedle(provider)}%`)));
const sortByOldestUpdate = (a, b) => new Date(a.updated_at || 0).getTime() - new Date(b.updated_at || 0).getTime();
async function pollCourierTracking({ batchSize = 50, providers, } = {}) {
    const limit = normalizeBatchSize(batchSize);
    const providerFilter = parseProviderFilter(providers);
    const b2cPending = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        integration_type: b2cOrders_1.b2c_orders.integration_type,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        updated_at: b2cOrders_1.b2c_orders.updated_at,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)(providerScope(b2cOrders_1.b2c_orders, providerFilter), (0, drizzle_orm_1.isNotNull)(b2cOrders_1.b2c_orders.awb_number), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2cOrders_1.b2c_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2cOrders_1.b2c_orders.order_status))))
        .orderBy((0, drizzle_orm_1.asc)(b2cOrders_1.b2c_orders.updated_at))
        .limit(limit);
    const b2bPending = await client_1.db
        .select({
        id: b2bOrders_1.b2b_orders.id,
        order_number: b2bOrders_1.b2b_orders.order_number,
        awb_number: b2bOrders_1.b2b_orders.awb_number,
        integration_type: b2bOrders_1.b2b_orders.integration_type,
        courier_partner: b2bOrders_1.b2b_orders.courier_partner,
        updated_at: b2bOrders_1.b2b_orders.updated_at,
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)(providerScope(b2bOrders_1.b2b_orders, providerFilter), (0, drizzle_orm_1.isNotNull)(b2bOrders_1.b2b_orders.awb_number), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2bOrders_1.b2b_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2bOrders_1.b2b_orders.order_status))))
        .orderBy((0, drizzle_orm_1.asc)(b2bOrders_1.b2b_orders.updated_at))
        .limit(limit);
    const pending = [
        ...b2cPending.map((order) => ({ ...order, source_type: 'b2c' })),
        ...b2bPending.map((order) => ({ ...order, source_type: 'b2b' })),
    ]
        .sort(sortByOldestUpdate)
        .slice(0, limit);
    if (!pending.length) {
        return { checked: 0, updated: 0, failed: 0, providers: providerFilter };
    }
    let updated = 0;
    let failed = 0;
    for (const order of pending) {
        const awb = String(order.awb_number || '').trim();
        if (!awb)
            continue;
        try {
            await (0, shiprocket_service_1.trackByAwbService)(awb);
            updated += 1;
        }
        catch (err) {
            failed += 1;
            console.error('[CourierTracking] Tracking poll failed', {
                order_id: order.id,
                order_number: order.order_number,
                order_type: order.source_type,
                integration_type: order.integration_type,
                courier_partner: order.courier_partner,
                awb,
                error: err?.message || err,
            });
        }
    }
    return { checked: pending.length, updated, failed, providers: providerFilter };
}
