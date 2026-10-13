"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordRtoEvent = recordRtoEvent;
exports.listRtoEvents = listRtoEvents;
exports.listRtoEventsAdmin = listRtoEventsAdmin;
exports.adminRtoKpis = adminRtoKpis;
exports.adminRtoExport = adminRtoExport;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const rto_1 = require("../schema/rto");
const b2cOrders_1 = require("../schema/b2cOrders");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const csv_1 = require("../../utils/csv");
const invoiceHelpers_1 = require("./invoiceHelpers");
const normalizeText = (value) => String(value ?? '').trim();
const parseProducts = (rawProducts) => {
    let productsData = [];
    if (Array.isArray(rawProducts)) {
        productsData = rawProducts;
    }
    else if (typeof rawProducts === 'string' && rawProducts.trim()) {
        try {
            const parsed = JSON.parse(rawProducts);
            productsData = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            productsData = [];
        }
    }
    return productsData
        .map((item) => {
        const name = normalizeText(item?.name ?? item?.productName ?? item?.box_name ?? item?.title ?? 'Product') ||
            'Product';
        const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1) || 1);
        return { name, qty };
    })
        .filter((item) => Boolean(item.name));
};
const summarizeProducts = (rawProducts) => {
    const products = parseProducts(rawProducts);
    if (!products.length)
        return null;
    return products.map((item) => (item.qty > 1 ? `${item.name} x${item.qty}` : item.name)).join(', ');
};
const resolveMerchantName = (row) => {
    const pickupDetails = (0, invoiceHelpers_1.normalizePickupDetails)(row.pickup_details);
    return (normalizeText(pickupDetails?.warehouse_name ||
        pickupDetails?.name ||
        row.merchant_name ||
        'Seller') || 'Seller');
};
const rtoEventSelect = {
    id: rto_1.rto_events.id,
    order_id: rto_1.rto_events.order_id,
    user_id: rto_1.rto_events.user_id,
    awb_number: rto_1.rto_events.awb_number,
    status: rto_1.rto_events.status,
    reason: rto_1.rto_events.reason,
    remarks: rto_1.rto_events.remarks,
    rto_charges: rto_1.rto_events.rto_charges,
    created_at: rto_1.rto_events.created_at,
    updated_at: rto_1.rto_events.updated_at,
    order_number: b2cOrders_1.b2c_orders.order_number,
    courier_partner: b2cOrders_1.b2c_orders.courier_partner,
    pickup_details: b2cOrders_1.b2c_orders.pickup_details,
    merchant_name: (0, drizzle_orm_1.sql) `COALESCE(
    NULLIF((${b2cOrders_1.b2c_orders.pickup_details} ->> 'warehouse_name'), ''),
    NULLIF((${b2cOrders_1.b2c_orders.pickup_details} ->> 'name'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'brandName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'businessName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'contactPerson'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'companyName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'displayName'), ''),
    NULLIF(${users_1.users.email}, ''),
    NULLIF(${users_1.users.phone}, ''),
    NULLIF(${b2cOrders_1.b2c_orders.user_id}::text, '')
  )`,
    product_summary: b2cOrders_1.b2c_orders.products,
    source: (0, drizzle_orm_1.sql) `'event'`,
};
const legacyRtoSelect = {
    id: (0, drizzle_orm_1.sql) `concat('legacy-', ${b2cOrders_1.b2c_orders.id}::text)`,
    order_id: b2cOrders_1.b2c_orders.id,
    user_id: b2cOrders_1.b2c_orders.user_id,
    awb_number: b2cOrders_1.b2c_orders.awb_number,
    status: b2cOrders_1.b2c_orders.order_status,
    reason: b2cOrders_1.b2c_orders.provider_last_status,
    remarks: b2cOrders_1.b2c_orders.delivery_message,
    rto_charges: (0, drizzle_orm_1.sql) `null`,
    created_at: (0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at})`,
    updated_at: (0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at})`,
    order_number: b2cOrders_1.b2c_orders.order_number,
    courier_partner: b2cOrders_1.b2c_orders.courier_partner,
    pickup_details: b2cOrders_1.b2c_orders.pickup_details,
    merchant_name: (0, drizzle_orm_1.sql) `COALESCE(
    NULLIF((${b2cOrders_1.b2c_orders.pickup_details} ->> 'warehouse_name'), ''),
    NULLIF((${b2cOrders_1.b2c_orders.pickup_details} ->> 'name'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'brandName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'businessName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'contactPerson'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'companyName'), ''),
    NULLIF((${userProfile_1.userProfiles.companyInfo} ->> 'displayName'), ''),
    NULLIF(${users_1.users.email}, ''),
    NULLIF(${users_1.users.phone}, ''),
    NULLIF(${b2cOrders_1.b2c_orders.user_id}::text, '')
  )`,
    product_summary: b2cOrders_1.b2c_orders.products,
    delivery_location: b2cOrders_1.b2c_orders.delivery_location,
    delivery_message: b2cOrders_1.b2c_orders.delivery_message,
    provider_last_status: b2cOrders_1.b2c_orders.provider_last_status,
    manifest_error: b2cOrders_1.b2c_orders.manifest_error,
    source: (0, drizzle_orm_1.sql) `'legacy'`,
};
const toStartOfDay = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
};
const toEndOfDay = (value) => {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
};
const getRowTimestamp = (row) => {
    const value = row.created_at || row.updated_at;
    if (!value)
        return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
};
const buildSearchClause = (search, columns) => {
    if (!search)
        return undefined;
    const term = `%${search}%`;
    const clauses = columns.map((column) => (0, drizzle_orm_1.sql) `${column} ILIKE ${term}`);
    return clauses.length > 0 ? (0, drizzle_orm_1.or)(...clauses) : undefined;
};
const buildDateClause = (column, fromDate, toDate) => {
    const clauses = [];
    if (fromDate)
        clauses.push((0, drizzle_orm_1.sql) `${column} >= ${toStartOfDay(fromDate)}`);
    if (toDate)
        clauses.push((0, drizzle_orm_1.sql) `${column} <= ${toEndOfDay(toDate)}`);
    return clauses.length > 0 ? (0, drizzle_orm_1.and)(...clauses) : undefined;
};
const normalizeEventRow = (row) => ({
    id: String(row.id),
    order_id: String(row.order_id),
    user_id: String(row.user_id),
    awb_number: row.awb_number ?? null,
    status: String(row.status || ''),
    reason: row.reason ?? null,
    remarks: row.remarks ?? null,
    rto_charges: row.rto_charges ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    order_number: row.order_number ?? null,
    courier_partner: row.courier_partner ?? null,
    merchant_name: resolveMerchantName(row),
    product_summary: summarizeProducts(row.product_summary),
    source: 'event',
});
const normalizeLegacyRow = (row) => {
    const detailParts = [
        normalizeText(row.provider_last_status),
        normalizeText(row.delivery_message),
        normalizeText(row.manifest_error),
    ].filter(Boolean);
    const remarkParts = [normalizeText(row.delivery_location), normalizeText(row.delivery_message)].filter(Boolean);
    return {
        id: String(row.id),
        order_id: String(row.order_id),
        user_id: String(row.user_id),
        awb_number: row.awb_number ?? null,
        status: String(row.status || 'rto'),
        reason: detailParts[0] || null,
        remarks: remarkParts.join(' | ') || null,
        rto_charges: null,
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
        order_number: row.order_number ?? null,
        courier_partner: row.courier_partner ?? null,
        merchant_name: resolveMerchantName(row),
        product_summary: summarizeProducts(row.product_summary),
        source: 'legacy',
    };
};
async function loadUnifiedRtoRows(params) {
    const { userId, orderId, search = '', fromDate, toDate } = params;
    const normalizedSearch = search.trim();
    const eventFilters = [];
    if (params.courier)
        eventFilters.push((0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, `%${params.courier.trim()}%`));
    if (userId)
        eventFilters.push((0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId));
    if (orderId)
        eventFilters.push((0, drizzle_orm_1.eq)(rto_1.rto_events.order_id, orderId));
    const eventWhereBase = eventFilters.length > 0 ? (0, drizzle_orm_1.and)(...eventFilters) : (0, drizzle_orm_1.sql) `true`;
    const eventSearchWhere = buildSearchClause(normalizedSearch, [
        rto_1.rto_events.awb_number,
        (0, drizzle_orm_1.sql) `${rto_1.rto_events.order_id}::text`,
        b2cOrders_1.b2c_orders.order_number,
        rto_1.rto_events.reason,
        rto_1.rto_events.remarks,
        b2cOrders_1.b2c_orders.courier_partner,
    ]);
    const eventDateWhere = buildDateClause(rto_1.rto_events.created_at, fromDate, toDate);
    const eventWhere = eventSearchWhere || eventDateWhere
        ? (0, drizzle_orm_1.and)(eventWhereBase, eventSearchWhere || (0, drizzle_orm_1.sql) `true`, eventDateWhere || (0, drizzle_orm_1.sql) `true`)
        : eventWhereBase;
    const legacyFilters = [
        (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_status} IN ('rto', 'rto_in_transit', 'rto_delivered')`,
        (0, drizzle_orm_1.sql) `NOT EXISTS (
      SELECT 1
      FROM ${rto_1.rto_events} legacy_rto_events
      WHERE legacy_rto_events.order_id = ${b2cOrders_1.b2c_orders.id}
    )`,
    ];
    if (userId)
        legacyFilters.unshift((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId));
    if (params.courier)
        legacyFilters.push((0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, `%${params.courier.trim()}%`));
    if (orderId)
        legacyFilters.push((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
    const legacyWhereBase = (0, drizzle_orm_1.and)(...legacyFilters);
    const legacySearchWhere = buildSearchClause(normalizedSearch, [
        b2cOrders_1.b2c_orders.awb_number,
        b2cOrders_1.b2c_orders.order_number,
        b2cOrders_1.b2c_orders.provider_last_status,
        b2cOrders_1.b2c_orders.delivery_message,
        b2cOrders_1.b2c_orders.manifest_error,
        b2cOrders_1.b2c_orders.courier_partner,
    ]);
    const legacyDateWhere = buildDateClause((0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at})`, fromDate, toDate);
    const legacyWhere = legacySearchWhere || legacyDateWhere
        ? (0, drizzle_orm_1.and)(legacyWhereBase, legacySearchWhere || (0, drizzle_orm_1.sql) `true`, legacyDateWhere || (0, drizzle_orm_1.sql) `true`)
        : legacyWhereBase;
    const [eventRows, legacyRows] = await Promise.all([
        client_1.db
            .select(rtoEventSelect)
            .from(rto_1.rto_events)
            .leftJoin(b2cOrders_1.b2c_orders, (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, rto_1.rto_events.order_id))
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, b2cOrders_1.b2c_orders.user_id))
            .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
            .where(eventWhere)
            .orderBy((0, drizzle_orm_1.desc)(rto_1.rto_events.created_at)),
        client_1.db
            .select(legacyRtoSelect)
            .from(b2cOrders_1.b2c_orders)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, b2cOrders_1.b2c_orders.user_id))
            .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
            .where(legacyWhere)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.updated_at}, ${b2cOrders_1.b2c_orders.created_at})`)),
    ]);
    return [...eventRows.map(normalizeEventRow), ...legacyRows.map(normalizeLegacyRow)].sort((a, b) => getRowTimestamp(b) - getRowTimestamp(a));
}
async function recordRtoEvent(params) {
    const { orderId, userId, awbNumber, status, reason, remarks, rtoCharges, payload } = params;
    const [inserted] = await client_1.db
        .insert(rto_1.rto_events)
        .values({
        order_id: orderId,
        user_id: userId,
        awb_number: awbNumber || null,
        status,
        reason: reason || null,
        remarks: remarks || null,
        rto_charges: rtoCharges ?? null,
        payload: payload || null,
    })
        .returning();
    // Send webhook event for RTO
    (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.rto', {
        order_id: orderId,
        awb_number: awbNumber,
        status,
        reason,
        remarks,
        rto_charges: rtoCharges,
        created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
    }).catch((err) => {
        console.error('Failed to send RTO webhook event:', err);
        // Don't fail the main flow if webhook fails
    });
    return inserted;
}
async function listRtoEvents(userId, orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const rows = await loadUnifiedRtoRows({ ...params, userId, orderId, search, fromDate, toDate });
    const offset = (page - 1) * limit;
    return {
        rows: rows.slice(offset, offset + limit),
        totalCount: rows.length,
    };
}
async function listRtoEventsAdmin(orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const rows = await loadUnifiedRtoRows({ ...params, orderId, search, fromDate, toDate });
    const offset = (page - 1) * limit;
    return {
        rows: rows.slice(offset, offset + limit),
        totalCount: rows.length,
    };
}
async function adminRtoKpis(params) {
    const { search = '', fromDate, toDate } = params || {};
    const rows = await loadUnifiedRtoRows({ ...params, search, fromDate, toDate });
    const byStatus = new Map();
    const byCourier = new Map();
    let totalCharges = 0;
    for (const row of rows) {
        const status = normalizeText(row.status) || 'unknown';
        const courier = normalizeText(row.courier_partner) || 'Unknown';
        byStatus.set(status, (byStatus.get(status) || 0) + 1);
        byCourier.set(courier, (byCourier.get(courier) || 0) + 1);
        totalCharges += Number(row.rto_charges || 0);
    }
    return {
        total: rows.length,
        totalCharges,
        byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
        byCourier: Array.from(byCourier.entries()).map(([courier, count]) => ({ courier, count })),
    };
}
async function adminRtoExport(params) {
    const { search = '', fromDate, toDate } = params || {};
    const rows = await loadUnifiedRtoRows({ ...params, search, fromDate, toDate });
    const headers = [
        'Created At',
        'AWB',
        'Seller Detail',
        'Order ID',
        'Order Number',
        'Products',
        'Status',
        'Reason',
        'Remarks',
        'RTO Charges',
        'Courier',
        'Source',
    ];
    const rowsData = rows.map((r) => [
        r.created_at ? new Date(r.created_at).toISOString() : '',
        r.awb_number || '',
        r.merchant_name || '',
        r.order_id || '',
        r.order_number || '',
        r.product_summary || '',
        r.status || '',
        r.reason || '',
        r.remarks || '',
        r.rto_charges != null ? Number(r.rto_charges) : '',
        r.courier_partner || '',
        r.source,
    ]);
    return (0, csv_1.buildCsv)(headers, rowsData);
}
