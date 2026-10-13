"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMerchantDashboardStats = exports.getCourierDistribution = exports.getTopDestinations = exports.getInvoiceStatus = exports.getPendingActions = exports.getIncomingPickups = void 0;
// services/pickupService.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const codRemittance_1 = require("../schema/codRemittance");
const invoices_1 = require("../schema/invoices");
const rto_1 = require("../schema/rto");
const supportTickets_1 = require("../schema/supportTickets");
const wallet_1 = require("../schema/wallet");
const weightDiscrepancies_1 = require("../schema/weightDiscrepancies");
const ACTIVE_NDR_STATUSES = new Set([
    'ndr',
    'undelivered',
    'lost',
    'address_issue',
    'nsl',
    'delivery_attempt_failed',
    'door_closed',
    'attempt_undelivered',
    'customer_not_available',
    'customer_unavailable',
    'consignee_not_available',
    'consignee_unavailable',
]);
const NON_REVENUE_STATUSES = new Set([
    'failed',
    'manifest_failed',
    'cancelled',
    'cancellation_requested',
]);
const parseProviderMeta = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : {};
        }
        catch {
            return {};
        }
    }
    return {};
};
const getResolvedCodAmount = (order) => {
    if (String(order.order_type || '').trim().toLowerCase() !== 'cod') {
        return 0;
    }
    const providerMeta = parseProviderMeta(order.provider_meta);
    const providerMetaCodAmount = Number(providerMeta.cod_amount ?? providerMeta.codAmount ?? providerMeta.collectable_amount ?? 0);
    if (Number.isFinite(providerMetaCodAmount) && providerMetaCodAmount > 0) {
        return providerMetaCodAmount;
    }
    return Number(order.order_amount || 0);
};
const isActiveNdrStatus = (status) => {
    const normalized = String(status || '').trim().toLowerCase();
    if (!normalized || normalized === 'ndr_action')
        return false;
    if (ACTIVE_NDR_STATUSES.has(normalized))
        return true;
    return Array.from(ACTIVE_NDR_STATUSES).some((needle) => normalized.includes(needle));
};
const countActiveNdrOrders = (orders) => new Set(orders.filter((order) => isActiveNdrStatus(order.order_status)).map((order) => order.id))
    .size;
const getUnifiedRtoCount = async (userId, asOf, fromDate) => {
    const eventConditions = [(0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId), (0, drizzle_orm_1.sql) `${rto_1.rto_events.created_at} <= ${asOf}`];
    const legacyConditions = [
        (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId),
        (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_status} IN ('rto', 'rto_in_transit', 'rto_delivered')`,
        (0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at}) <= ${asOf}`,
        (0, drizzle_orm_1.sql) `NOT EXISTS (
      SELECT 1
      FROM ${rto_1.rto_events} existing_rto
      WHERE existing_rto.order_id = ${b2cOrders_1.b2c_orders.id}
    )`,
    ];
    if (fromDate) {
        eventConditions.push((0, drizzle_orm_1.sql) `${rto_1.rto_events.created_at} >= ${fromDate}`);
        legacyConditions.push((0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at}) >= ${fromDate}`);
    }
    const [eventRows, legacyRows] = await Promise.all([
        client_1.db
            .select({ orderId: rto_1.rto_events.order_id })
            .from(rto_1.rto_events)
            .where((0, drizzle_orm_1.and)(...eventConditions)),
        client_1.db
            .select({ orderId: b2cOrders_1.b2c_orders.id })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.and)(...legacyConditions)),
    ]);
    return new Set([...eventRows.map((event) => event.orderId), ...legacyRows.map((order) => order.orderId)])
        .size;
};
const getIncomingPickups = async (userId) => {
    // 🔹 Fetch top 3 pickups from B2C
    const b2cPickups = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        order_number: b2cOrders_1.b2c_orders.order_number,
        pickup_details: b2cOrders_1.b2c_orders.pickup_details,
        created_at: b2cOrders_1.b2c_orders.created_at,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_status, 'pickup_initiated')))
        .orderBy(b2cOrders_1.b2c_orders.created_at) // oldest first
        .limit(3);
    // 🔹 Fetch top 3 pickups from B2B
    const b2bPickups = await client_1.db
        .select({
        id: b2bOrders_1.b2b_orders.id,
        awb_number: b2bOrders_1.b2b_orders.awb_number,
        courier_partner: b2bOrders_1.b2b_orders.courier_partner,
        order_number: b2bOrders_1.b2b_orders.order_number,
        pickup_details: b2bOrders_1.b2b_orders.pickup_details,
        created_at: b2bOrders_1.b2b_orders.created_at,
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.order_status, 'pickup_initiated')))
        .orderBy(b2bOrders_1.b2b_orders.created_at)
        .limit(3);
    // Merge and sort by created_at
    const allPickups = [...b2cPickups, ...b2bPickups].sort((a, b) => (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0));
    // Return only top 3 overall
    return allPickups.slice(0, 3);
};
exports.getIncomingPickups = getIncomingPickups;
const getPendingActions = async (userId) => {
    const [b2cActiveNdrOrders, b2bActiveNdrOrders] = await Promise.all([
        client_1.db
            .select({
            id: b2cOrders_1.b2c_orders.id,
            order_status: b2cOrders_1.b2c_orders.order_status,
        })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)),
        client_1.db
            .select({
            id: b2bOrders_1.b2b_orders.id,
            order_status: b2bOrders_1.b2b_orders.order_status,
        })
            .from(b2bOrders_1.b2b_orders)
            .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId)),
    ]);
    const ndrCount = countActiveNdrOrders([...b2cActiveNdrOrders, ...b2bActiveNdrOrders]);
    const rtoCount = await getUnifiedRtoCount(userId, new Date());
    // Count pending weight discrepancies
    const weightCount = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(weightDiscrepancies_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.user_id, userId), (0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.status, 'pending')));
    return {
        ndrCount,
        rtoCount: Number(rtoCount || 0),
        weightDiscrepancyCount: Number(weightCount[0]?.count || 0),
    };
};
exports.getPendingActions = getPendingActions;
const getInvoiceStatus = async (userId) => {
    const statusCounts = await client_1.db
        .select({
        status: invoices_1.invoices.status,
        count: (0, drizzle_orm_1.count)(),
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${invoices_1.invoices.netPayableAmount}::numeric), 0)`,
    })
        .from(invoices_1.invoices)
        .where((0, drizzle_orm_1.eq)(invoices_1.invoices.userId, userId))
        .groupBy(invoices_1.invoices.status);
    const statusSummary = {
        pending: { count: 0, totalAmount: 0 },
        paid: { count: 0, totalAmount: 0 },
        overdue: { count: 0, totalAmount: 0 },
    };
    for (const row of statusCounts) {
        if (row.status) {
            statusSummary[row.status] = {
                count: Number(row.count),
                totalAmount: Number(row.totalAmount),
            };
        }
    }
    return statusSummary;
};
exports.getInvoiceStatus = getInvoiceStatus;
const getTopDestinations = async (userId, limit = 10) => {
    // Get top cities from B2C orders
    const b2cCities = await client_1.db
        .select({
        city: b2cOrders_1.b2c_orders.city,
        state: b2cOrders_1.b2c_orders.state,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId))
        .groupBy(b2cOrders_1.b2c_orders.city, b2cOrders_1.b2c_orders.state)
        .orderBy((0, drizzle_orm_1.sql) `count(*) DESC`);
    // Get top cities from B2B orders
    const b2bCities = await client_1.db
        .select({
        city: b2bOrders_1.b2b_orders.city,
        state: b2bOrders_1.b2b_orders.state,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId))
        .groupBy(b2bOrders_1.b2b_orders.city, b2bOrders_1.b2b_orders.state)
        .orderBy((0, drizzle_orm_1.sql) `count(*) DESC`);
    // Merge and aggregate by city+state
    const cityMap = new Map();
    for (const row of b2cCities) {
        const key = `${row.city}-${row.state}`;
        const existing = cityMap.get(key);
        if (existing) {
            existing.count += Number(row.count);
        }
        else {
            cityMap.set(key, { city: row.city, state: row.state, count: Number(row.count) });
        }
    }
    for (const row of b2bCities) {
        const key = `${row.city}-${row.state}`;
        const existing = cityMap.get(key);
        if (existing) {
            existing.count += Number(row.count);
        }
        else {
            cityMap.set(key, { city: row.city, state: row.state, count: Number(row.count) });
        }
    }
    // Sort by count and return top N
    return Array.from(cityMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
};
exports.getTopDestinations = getTopDestinations;
const getCourierDistribution = async (userId) => {
    // Get courier distribution from B2C orders
    const b2cCouriers = await client_1.db
        .select({
        courier: b2cOrders_1.b2c_orders.courier_partner,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.courier_partner} IS NOT NULL`))
        .groupBy(b2cOrders_1.b2c_orders.courier_partner);
    // Get courier distribution from B2B orders
    const b2bCouriers = await client_1.db
        .select({
        courier: b2bOrders_1.b2b_orders.courier_partner,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.sql) `${b2bOrders_1.b2b_orders.courier_partner} IS NOT NULL`))
        .groupBy(b2bOrders_1.b2b_orders.courier_partner);
    // Merge and aggregate
    const courierMap = new Map();
    for (const row of b2cCouriers) {
        if (row.courier) {
            const existing = courierMap.get(row.courier) || 0;
            courierMap.set(row.courier, existing + Number(row.count));
        }
    }
    for (const row of b2bCouriers) {
        if (row.courier) {
            const existing = courierMap.get(row.courier) || 0;
            courierMap.set(row.courier, existing + Number(row.count));
        }
    }
    // Convert to array and sort by count
    return Array.from(courierMap.entries())
        .map(([courier, count]) => ({ courier, count }))
        .sort((a, b) => b.count - a.count);
};
exports.getCourierDistribution = getCourierDistribution;
// Comprehensive merchant dashboard stats
const getMerchantDashboardStats = async (userId, selectedDate, dateRange) => {
    const dashboardOrderColumns = {
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        order_date: b2cOrders_1.b2c_orders.order_date,
        order_amount: b2cOrders_1.b2c_orders.order_amount,
        order_type: b2cOrders_1.b2c_orders.order_type,
        order_status: b2cOrders_1.b2c_orders.order_status,
        shipping_charges: b2cOrders_1.b2c_orders.shipping_charges,
        freight_charges: b2cOrders_1.b2c_orders.freight_charges,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        city: b2cOrders_1.b2c_orders.city,
        state: b2cOrders_1.b2c_orders.state,
        provider_meta: b2cOrders_1.b2c_orders.provider_meta,
        created_at: b2cOrders_1.b2c_orders.created_at,
        updated_at: b2cOrders_1.b2c_orders.updated_at,
    };
    const b2bOrderColumns = {
        id: b2bOrders_1.b2b_orders.id,
        order_number: b2bOrders_1.b2b_orders.order_number,
        order_date: b2bOrders_1.b2b_orders.order_date,
        order_amount: b2bOrders_1.b2b_orders.order_amount,
        order_type: b2bOrders_1.b2b_orders.order_type,
        order_status: b2bOrders_1.b2b_orders.order_status,
        shipping_charges: b2bOrders_1.b2b_orders.shipping_charges,
        freight_charges: b2bOrders_1.b2b_orders.freight_charges,
        courier_partner: b2bOrders_1.b2b_orders.courier_partner,
        city: b2bOrders_1.b2b_orders.city,
        state: b2bOrders_1.b2b_orders.state,
        provider_meta: b2bOrders_1.b2b_orders.provider_meta,
        created_at: b2bOrders_1.b2b_orders.created_at,
        updated_at: b2bOrders_1.b2b_orders.updated_at,
    };
    const [b2cOrders, b2bOrders, walletRows, codRemittanceStats, tickets] = await Promise.all([
        client_1.db.select(dashboardOrderColumns).from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)),
        client_1.db.select(b2bOrderColumns).from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId)),
        client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1),
        client_1.db
            .select({
            pending: (0, drizzle_orm_1.sql) `COALESCE(SUM(CASE WHEN status = 'pending' THEN remittable_amount::numeric ELSE 0 END), 0)`,
            credited: (0, drizzle_orm_1.sql) `COALESCE(SUM(CASE WHEN status = 'credited' THEN remittable_amount::numeric ELSE 0 END), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId)),
        client_1.db.select().from(supportTickets_1.supportTickets).where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId)),
    ]);
    const allOrders = [...b2cOrders, ...b2bOrders];
    const [wallet] = walletRows;
    const actualNow = new Date();
    const hasDateRange = Boolean((selectedDate && !Number.isNaN(selectedDate.getTime())) ||
        (dateRange?.fromDate && !Number.isNaN(dateRange.fromDate.getTime())) ||
        (dateRange?.toDate && !Number.isNaN(dateRange.toDate.getTime())));
    const fallbackDate = selectedDate && !Number.isNaN(selectedDate.getTime()) ? selectedDate : actualNow;
    const requestedFromDate = dateRange?.fromDate && !Number.isNaN(dateRange.fromDate.getTime())
        ? dateRange.fromDate
        : fallbackDate;
    const requestedToDate = dateRange?.toDate && !Number.isNaN(dateRange.toDate.getTime())
        ? dateRange.toDate
        : fallbackDate;
    const startOfRequestedRange = new Date(requestedFromDate.getFullYear(), requestedFromDate.getMonth(), requestedFromDate.getDate());
    const endOfRequestedDay = new Date(requestedToDate.getFullYear(), requestedToDate.getMonth(), requestedToDate.getDate(), 23, 59, 59, 999);
    const now = endOfRequestedDay.getTime() > actualNow.getTime() ? actualNow : endOfRequestedDay;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const periodStart = hasDateRange ? startOfRequestedRange : new Date(0);
    const eligibleStart = periodStart;
    const rangeDays = Math.max(1, hasDateRange
        ? Math.floor((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1
        : 7);
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - 6);
    const previousPeriodStart = new Date(periodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - rangeDays);
    const previousWeekStart = hasDateRange ? previousPeriodStart : new Date(thisWeekStart);
    const comparisonStart = hasDateRange ? periodStart : thisWeekStart;
    const todayIso = today.toISOString().slice(0, 10);
    const getFirstValidDate = (...values) => {
        for (const value of values) {
            if (!value)
                continue;
            const parsed = new Date(value);
            if (!isNaN(parsed.getTime()))
                return parsed;
        }
        return new Date(0);
    };
    const getOrderTimestamp = (order) => getFirstValidDate(order.order_date, order.created_at, order.updated_at);
    const isOnOrBeforeSelectedDate = (date) => !isNaN(date.getTime()) && date.getTime() <= now.getTime();
    const isSameLocalDay = (date, target) => date.getFullYear() === target.getFullYear() &&
        date.getMonth() === target.getMonth() &&
        date.getDate() === target.getDate();
    const isWithinInclusiveRange = (date, start, end) => date >= start && date <= end;
    const isWithinHalfOpenRange = (date, start, endExclusive) => date >= start && date < endExclusive;
    const getCustomerProfit = (order) => {
        const normalizedStatus = String(order?.order_status || '').trim().toLowerCase();
        if (NON_REVENUE_STATUSES.has(normalizedStatus)) {
            return 0;
        }
        const shippingCharge = Number(order?.shipping_charges || 0);
        const freightCharge = Number(order?.freight_charges || 0);
        return freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge;
    };
    const eligibleOrders = allOrders.filter((order) => {
        const timestamp = getOrderTimestamp(order);
        return timestamp >= eligibleStart && isOnOrBeforeSelectedDate(timestamp);
    });
    const todayOrders = eligibleOrders;
    const pendingOrders = todayOrders.filter((order) => ['pending', 'booked', 'pickup_initiated'].includes(String(order.order_status || '').toLowerCase()));
    const inTransitOrders = todayOrders.filter((order) => ['shipment_created', 'in_transit', 'out_for_delivery'].includes(String(order.order_status || '').toLowerCase()));
    const deliveredToday = todayOrders.filter((order) => String(order.order_status || '').toLowerCase() === 'delivered');
    const todayRevenue = todayOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0);
    const totalRevenue = eligibleOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0);
    const totalShippingCharges = eligibleOrders.reduce((sum, order) => sum + Number(order.shipping_charges || 0), 0);
    const totalFreightCharges = eligibleOrders.reduce((sum, order) => sum + Number(order.freight_charges || 0), 0);
    const codOrders = eligibleOrders.filter((order) => String(order.order_type || '').toLowerCase() === 'cod');
    const codAmount = codOrders.reduce((sum, order) => sum + getResolvedCodAmount(order), 0);
    const codPendingAsOf = await client_1.db
        .select({
        pending: (0, drizzle_orm_1.sql) `COALESCE(SUM(CASE WHEN status = 'pending' AND ${codRemittance_1.codRemittances.createdAt} <= ${now} THEN remittable_amount::numeric ELSE 0 END), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId));
    const codRemittanceCredited = await client_1.db
        .select({
        credited: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}::numeric), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited'), ...(hasDateRange ? [(0, drizzle_orm_1.sql) `${codRemittance_1.codRemittances.creditedAt} >= ${periodStart}`] : []), (0, drizzle_orm_1.sql) `${codRemittance_1.codRemittances.creditedAt} <= ${now}`));
    const totalOrders = eligibleOrders.length;
    const nonCancelledOrders = eligibleOrders.filter((order) => String(order.order_status || '').toLowerCase() !== 'cancelled');
    const deliveredOrders = eligibleOrders.filter((order) => {
        const deliveredAt = getFirstValidDate(order.delivered_at, order.updated_at, order.created_at);
        return (String(order.order_status || '').toLowerCase() === 'delivered' &&
            isOnOrBeforeSelectedDate(deliveredAt));
    });
    const operationalBaseCount = nonCancelledOrders.length;
    const deliverySuccessRate = operationalBaseCount > 0 ? Math.round((deliveredOrders.length / operationalBaseCount) * 100) : 0;
    const ndrCount = countActiveNdrOrders(eligibleOrders);
    const ndrRate = operationalBaseCount > 0 ? Math.round((ndrCount / operationalBaseCount) * 100) : 0;
    const rtoCount = await getUnifiedRtoCount(userId, now, hasDateRange ? periodStart : undefined);
    const rtoRate = operationalBaseCount > 0 ? Math.round((rtoCount / operationalBaseCount) * 100) : 0;
    const deliveredOrdersWithDates = deliveredOrders.filter((order) => {
        const created = getOrderTimestamp(order);
        const delivered = getFirstValidDate(order.delivered_at, order.updated_at, order.created_at);
        return !isNaN(created.getTime()) && !isNaN(delivered.getTime());
    });
    const avgDeliveryTime = deliveredOrdersWithDates.length > 0
        ? Math.round(deliveredOrdersWithDates.reduce((sum, order) => {
            const created = getOrderTimestamp(order);
            const delivered = getFirstValidDate(order.delivered_at, order.updated_at, order.created_at);
            return sum + Math.floor((delivered.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / deliveredOrdersWithDates.length)
        : 0;
    const courierPerformance = eligibleOrders.reduce((acc, order) => {
        const courier = order.courier_partner || 'Unknown';
        if (!acc[courier])
            acc[courier] = { count: 0, delivered: 0, revenue: 0, deliveryRate: 0 };
        if (String(order.order_status || '').toLowerCase() !== 'cancelled') {
            acc[courier].count += 1;
        }
        acc[courier].revenue += getCustomerProfit(order);
        if (String(order.order_status || '').toLowerCase() === 'delivered') {
            acc[courier].delivered += 1;
        }
        return acc;
    }, {});
    Object.keys(courierPerformance).forEach((courier) => {
        const perf = courierPerformance[courier];
        perf.deliveryRate = perf.count > 0 ? Math.round((perf.delivered / perf.count) * 100) : 0;
    });
    const ordersByDate = {};
    const revenueByDate = {};
    const ordersByStatus = {};
    const revenueByOrderType = {};
    const ordersByCourier = {};
    const revenueByCourier = {};
    const ordersByDate30 = {};
    const revenueByDate30 = {};
    const chartBucketKey = (date) => hasDateRange
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const firstOrderDate = eligibleOrders.reduce((earliest, order) => {
        const timestamp = getOrderTimestamp(order);
        return timestamp < earliest ? timestamp : earliest;
    }, new Date(today));
    const chartStart = hasDateRange
        ? periodStart
        : new Date(firstOrderDate.getFullYear(), firstOrderDate.getMonth(), 1);
    const chartBucketCount = hasDateRange
        ? Math.min(30, rangeDays)
        : Math.max(1, (today.getFullYear() - chartStart.getFullYear()) * 12 +
            today.getMonth() -
            chartStart.getMonth() +
            1);
    for (let i = chartBucketCount - 1; i >= 0; i--) {
        const date = new Date(today);
        if (hasDateRange)
            date.setDate(date.getDate() - i);
        else
            date.setMonth(date.getMonth() - i);
        const dateStr = chartBucketKey(date);
        const bucketOrders = eligibleOrders.filter((order) => {
            const orderDate = getOrderTimestamp(order);
            return hasDateRange
                ? isSameLocalDay(orderDate, date)
                : orderDate.getFullYear() === date.getFullYear() && orderDate.getMonth() === date.getMonth();
        });
        ordersByDate[dateStr] = bucketOrders.length;
        revenueByDate[dateStr] = bucketOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0);
        ordersByDate30[dateStr] = bucketOrders.length;
        revenueByDate30[dateStr] = revenueByDate[dateStr];
    }
    eligibleOrders.forEach((order) => {
        const status = String(order.order_status || 'pending').toLowerCase();
        const orderType = String(order.order_type || 'prepaid').toLowerCase();
        const courier = order.courier_partner || 'Unknown';
        const customerProfit = getCustomerProfit(order);
        ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
        revenueByOrderType[orderType] = (revenueByOrderType[orderType] || 0) + customerProfit;
        ordersByCourier[courier] = (ordersByCourier[courier] || 0) + 1;
        revenueByCourier[courier] = (revenueByCourier[courier] || 0) + customerProfit;
    });
    const prepaidOrders = eligibleOrders.filter((order) => String(order.order_type || '').toLowerCase() === 'prepaid');
    const codOrdersCount = eligibleOrders.filter((order) => String(order.order_type || '').toLowerCase() === 'cod');
    const avgOrderValue = eligibleOrders.length > 0
        ? eligibleOrders.reduce((sum, order) => sum + Number(order.order_amount || 0), 0) /
            eligibleOrders.length
        : 0;
    const cityRevenue = {};
    eligibleOrders.forEach((order) => {
        const city = order.city || 'Unknown';
        cityRevenue[city] = (cityRevenue[city] || 0) + getCustomerProfit(order);
    });
    const topRevenueCities = Object.entries(cityRevenue)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([city, revenue]) => ({ city, revenue }));
    const thisWeekOrders = eligibleOrders.filter((order) => isWithinInclusiveRange(getOrderTimestamp(order), comparisonStart, now));
    const previousWeekOrders = eligibleOrders.filter((order) => isWithinHalfOpenRange(getOrderTimestamp(order), previousWeekStart, comparisonStart));
    const thisWeekRevenue = thisWeekOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0);
    const previousWeekRevenue = previousWeekOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0);
    const ordersGrowth = previousWeekOrders.length > 0
        ? Math.round(((thisWeekOrders.length - previousWeekOrders.length) / previousWeekOrders.length) * 100)
        : thisWeekOrders.length > 0
            ? 100
            : 0;
    const revenueGrowth = previousWeekRevenue > 0
        ? Math.round(((thisWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100)
        : thisWeekRevenue > 0
            ? 100
            : 0;
    const historicalWalletBalance = wallet
        ? hasDateRange
            ? Number((await client_1.db
                .select({
                balance: (0, drizzle_orm_1.sql) `COALESCE(SUM(CASE WHEN ${wallet_1.walletTransactions.type} = 'credit' THEN ${wallet_1.walletTransactions.amount}::numeric ELSE -${wallet_1.walletTransactions.amount}::numeric END), 0)`,
            })
                .from(wallet_1.walletTransactions)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id), (0, drizzle_orm_1.sql) `${wallet_1.walletTransactions.created_at} <= ${now}`)))[0]?.balance || 0)
            : Number(wallet.balance || 0)
        : 0;
    const recentTransactions = wallet
        ? await client_1.db
            .select()
            .from(wallet_1.walletTransactions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id), (0, drizzle_orm_1.sql) `${wallet_1.walletTransactions.created_at} <= ${now}`))
            .orderBy((0, drizzle_orm_1.sql) `${wallet_1.walletTransactions.created_at} DESC`)
            .limit(5)
        : [];
    const recentOrdersList = [...eligibleOrders]
        .sort((a, b) => getOrderTimestamp(b).getTime() - getOrderTimestamp(a).getTime())
        .slice(0, 5);
    const invoiceCounts = await client_1.db
        .select({
        status: invoices_1.invoices.status,
        count: (0, drizzle_orm_1.count)(),
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${invoices_1.invoices.netPayableAmount}::numeric), 0)`,
    })
        .from(invoices_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(invoices_1.invoices.userId, userId), (0, drizzle_orm_1.sql) `${invoices_1.invoices.invoiceDate} <= ${todayIso}`))
        .groupBy(invoices_1.invoices.status);
    const invoiceStatus = {
        pending: { count: 0, totalAmount: 0 },
        paid: { count: 0, totalAmount: 0 },
        overdue: { count: 0, totalAmount: 0 },
    };
    for (const row of invoiceCounts) {
        if (row.status) {
            invoiceStatus[row.status] = {
                count: Number(row.count),
                totalAmount: Number(row.totalAmount),
            };
        }
    }
    const weightDiscrepancyCount = Number((await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(weightDiscrepancies_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.user_id, userId), (0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.status, 'pending'), (0, drizzle_orm_1.sql) `${weightDiscrepancies_1.weight_discrepancies.created_at} <= ${now}`)))[0]?.count || 0);
    const topDestinations = Array.from(eligibleOrders.reduce((map, order) => {
        const city = String(order.city || '').trim();
        const state = String(order.state || '').trim();
        if (!city && !state)
            return map;
        const key = `${city}-${state}`;
        const current = map.get(key) || { city, state, count: 0 };
        current.count += 1;
        map.set(key, current);
        return map;
    }, new Map()))
        .map(([, value]) => value)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    const courierDistribution = Array.from(eligibleOrders.reduce((map, order) => {
        const courier = String(order.courier_partner || '').trim() || 'Unknown';
        map.set(courier, (map.get(courier) || 0) + 1);
        return map;
    }, new Map()))
        .map(([courier, countValue]) => ({ courier, count: countValue }))
        .sort((a, b) => b.count - a.count);
    const eligibleTickets = tickets.filter((ticket) => isOnOrBeforeSelectedDate(getFirstValidDate(ticket.createdAt)));
    const openTickets = eligibleTickets.filter((ticket) => ticket.status === 'open');
    const inProgressTickets = eligibleTickets.filter((ticket) => ticket.status === 'in_progress');
    return {
        success: true,
        data: {
            asOfDate: todayIso,
            isAllTime: !hasDateRange,
            todayOperations: {
                orders: todayOrders.length,
                pending: pendingOrders.length,
                inTransit: inTransitOrders.length,
                delivered: deliveredToday.length,
            },
            financial: {
                walletBalance: historicalWalletBalance,
                todayRevenue,
                totalRevenue,
                totalShippingCharges,
                totalFreightCharges,
                profit: totalRevenue,
                codAmount,
                codRemittanceDue: Number(codPendingAsOf[0]?.pending || 0),
                codRemittanceCredited: Number(codRemittanceCredited[0]?.credited || 0),
            },
            operational: {
                deliverySuccessRate,
                ndrRate,
                rtoRate,
                avgDeliveryTime,
                totalOrders,
                deliveredOrders: deliveredOrders.length,
                ndrCount,
                rtoCount,
            },
            actions: {
                ndrCount,
                rtoCount,
                weightDiscrepancyCount,
                openTickets: openTickets.length,
                inProgressTickets: inProgressTickets.length,
                pendingInvoices: invoiceStatus.pending.count,
                pendingInvoiceAmount: invoiceStatus.pending.totalAmount,
                overdueInvoices: invoiceStatus.overdue.count,
                overdueInvoiceAmount: invoiceStatus.overdue.totalAmount,
            },
            couriers: {
                performance: courierPerformance,
                distribution: courierDistribution,
            },
            geographic: {
                topDestinations,
            },
            charts: {
                ordersByDate: Object.entries(ordersByDate).map(([date, countValue]) => ({ date, orders: countValue })),
                revenueByDate: Object.entries(revenueByDate).map(([date, revenue]) => ({ date, revenue })),
                ordersByDate30: Object.entries(ordersByDate30).map(([date, countValue]) => ({ date, orders: countValue })),
                revenueByDate30: Object.entries(revenueByDate30).map(([date, revenue]) => ({ date, revenue })),
                ordersByStatus: Object.entries(ordersByStatus).map(([status, countValue]) => ({ status, count: countValue })),
                revenueByOrderType: Object.entries(revenueByOrderType).map(([type, revenue]) => ({ type, revenue })),
                ordersByCourier: Object.entries(ordersByCourier).map(([courier, countValue]) => ({ courier, count: countValue })),
                revenueByCourier: Object.entries(revenueByCourier).map(([courier, revenue]) => ({ courier, revenue })),
            },
            metrics: {
                avgOrderValue,
                totalPrepaidOrders: prepaidOrders.length,
                totalCodOrders: codOrdersCount.length,
                prepaidRevenue: prepaidOrders.reduce((sum, order) => sum + getCustomerProfit(order), 0),
                codRevenue: codOrdersCount.reduce((sum, order) => sum + getCustomerProfit(order), 0),
                topRevenueCities,
            },
            recentOrders: recentOrdersList,
            trends: {
                ordersGrowth,
                revenueGrowth,
                thisWeekOrders: thisWeekOrders.length,
                lastWeekOrders: previousWeekOrders.length,
                thisWeekRevenue,
                lastWeekRevenue: previousWeekRevenue,
            },
            recentActivity: {
                transactions: recentTransactions.map((transaction) => ({
                    id: transaction.id,
                    type: transaction.type,
                    amount: Number(transaction.amount || 0),
                    reason: transaction.reason || '',
                    createdAt: transaction.created_at,
                })),
                recentOrders: recentOrdersList.map((order) => ({
                    id: order.id,
                    orderNumber: order.order_number || '',
                    status: order.order_status || '',
                    amount: Number(order.order_amount || 0),
                    createdAt: getOrderTimestamp(order),
                })),
            },
        },
    };
};
exports.getMerchantDashboardStats = getMerchantDashboardStats;
