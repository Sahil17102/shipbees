"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOrderUserMetadata = exports.fetchCombinedOrdersPage = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const orderListSelects_1 = require("./orderListSelects");
const orderStageStatuses_1 = require("../../utils/orderStageStatuses");
const DEFAULT_PAGE_LIMIT = 10;
const toSqlDateStart = (value) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
};
const toSqlDateEnd = (value) => {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
    return date;
};
const buildStatusCondition = (qualifiedColumn, status) => {
    if (!status)
        return null;
    const normalized = (0, orderStageStatuses_1.expandOrderStatusFilter)(status);
    if (normalized.length === 0)
        return null;
    return (0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.raw(qualifiedColumn)} IN (${drizzle_orm_1.sql.join(normalized.map((value) => (0, drizzle_orm_1.sql) `${value}`), (0, drizzle_orm_1.sql) `, `)})`;
};
const buildSearchCondition = (alias, search) => {
    const trimmed = String(search || '').trim();
    if (!trimmed)
        return null;
    const pattern = `%${trimmed}%`;
    return (0, drizzle_orm_1.sql) `(
    COALESCE(${drizzle_orm_1.sql.raw(`${alias}.order_number`)}, '') ILIKE ${pattern}
    OR COALESCE(${drizzle_orm_1.sql.raw(`${alias}.buyer_name`)}, '') ILIKE ${pattern}
    OR COALESCE(${drizzle_orm_1.sql.raw(`${alias}.buyer_phone`)}, '') ILIKE ${pattern}
    OR COALESCE(${drizzle_orm_1.sql.raw(`${alias}.awb_number`)}, '') ILIKE ${pattern}
    OR COALESCE(${drizzle_orm_1.sql.raw(`${alias}.provider_reference`)}, '') ILIKE ${pattern}
    OR COALESCE(${drizzle_orm_1.sql.raw(`${alias}.provider_request_id`)}, '') ILIKE ${pattern}
  )`;
};
const buildPickupAlertCondition = (alias, pickupAlert) => {
    const normalizedAlert = String(pickupAlert || '').trim();
    if (!normalizedAlert)
        return null;
    const orderStatus = (0, drizzle_orm_1.sql) `lower(coalesce(${drizzle_orm_1.sql.raw(`${alias}.order_status`)}, ''))`;
    const activeShipmentCondition = (0, drizzle_orm_1.sql) `(
    coalesce(${drizzle_orm_1.sql.raw(`${alias}.awb_number`)}, '') <> ''
    OR coalesce(${drizzle_orm_1.sql.raw(`${alias}.shipment_id`)}, '') <> ''
  ) AND ${orderStatus} NOT IN (
    'in_transit',
    'out_for_delivery',
    'delivered',
    'cancelled',
    'rto',
    'rto_in_transit',
    'rto_delivered'
  )`;
    const missingPickupSlotCondition = (0, drizzle_orm_1.sql) `(
    coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'pickup_date', '') = ''
    AND coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'pickupDate', '') = ''
    AND coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'requested_pickup_date', '') = ''
    AND coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'requestedPickupDate', '') = ''
    AND coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'expected_pickup_date', '') = ''
    AND coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_details`)} ->> 'expectedPickupDate', '') = ''
  )`;
    if (normalizedAlert === 'pending_for_pickup') {
        if (alias === 'b2c') {
            const pickupStatus = (0, drizzle_orm_1.sql) `lower(coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_status`)}, ''))`;
            return (0, drizzle_orm_1.sql) `${activeShipmentCondition} AND (
        ${orderStatus} IN ('shipment_created', 'pickup_initiated', 'booked')
        OR ${pickupStatus} IN ('pending', 'scheduled', 'pickup_scheduled', 'pickup_initiated')
      )`;
        }
        return (0, drizzle_orm_1.sql) `${activeShipmentCondition} AND ${orderStatus} IN (
      'shipment_created',
      'pickup_initiated',
      'booked',
      'pending'
    )`;
    }
    if (normalizedAlert === 'not_scheduled') {
        if (alias === 'b2c') {
            const pickupStatus = (0, drizzle_orm_1.sql) `lower(coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_status`)}, ''))`;
            return (0, drizzle_orm_1.sql) `${activeShipmentCondition} AND (
        coalesce(${drizzle_orm_1.sql.raw(`${alias}.pickup_error`)}, '') <> ''
        OR ${pickupStatus} IN ('', 'pending', 'failed', 'not_scheduled')
        OR ${missingPickupSlotCondition}
      )`;
        }
        return (0, drizzle_orm_1.sql) `${activeShipmentCondition} AND ${missingPickupSlotCondition}`;
    }
    return null;
};
const buildOrderConditions = (alias, filters) => {
    const conditions = [(0, drizzle_orm_1.sql) `true`];
    if (filters.assistedOnly) {
        if (alias === 'b2b') {
            conditions.push((0, drizzle_orm_1.sql) `false`);
        }
        else {
            conditions.push((0, drizzle_orm_1.sql) `COALESCE(${drizzle_orm_1.sql.raw(`${alias}.tags`)}, '') ILIKE '%assisted_booking%'`);
        }
    }
    if (filters.userId) {
        conditions.push((0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.raw(`${alias}.user_id`)} = ${filters.userId}`);
    }
    const statusCondition = buildStatusCondition(`${alias}.order_status`, filters.status);
    if (statusCondition) {
        conditions.push(statusCondition);
    }
    if (filters.fromDate) {
        conditions.push((0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.raw(`${alias}.created_at`)} >= ${toSqlDateStart(filters.fromDate)}`);
    }
    if (filters.toDate) {
        conditions.push((0, drizzle_orm_1.sql) `${drizzle_orm_1.sql.raw(`${alias}.created_at`)} <= ${toSqlDateEnd(filters.toDate)}`);
    }
    const searchCondition = buildSearchCondition(alias, filters.search);
    if (searchCondition) {
        conditions.push(searchCondition);
    }
    const pickupAlertCondition = buildPickupAlertCondition(alias, filters.pickupAlert);
    if (pickupAlertCondition) {
        conditions.push(pickupAlertCondition);
    }
    return conditions;
};
const fetchCombinedOrderPageRows = async ({ page = 1, limit = DEFAULT_PAGE_LIMIT, filters, }) => {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.max(limit, 1);
    const offset = (safePage - 1) * safeLimit;
    const sortOrder = filters.sortOrder === 'asc' ? (0, drizzle_orm_1.sql) `ASC` : (0, drizzle_orm_1.sql) `DESC`;
    const sortColumn = filters.sortBy === 'updated_at' ? 'updated_at' : 'created_at';
    const b2cConditions = buildOrderConditions('b2c', filters);
    const b2bConditions = buildOrderConditions('b2b', filters);
    const countResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT COUNT(*)::int AS total
    FROM (
      SELECT b2c.id
      FROM b2c_orders AS b2c
      WHERE ${drizzle_orm_1.sql.join(b2cConditions, (0, drizzle_orm_1.sql) ` AND `)}
      UNION ALL
      SELECT b2b.id
      FROM b2b_orders AS b2b
      WHERE ${drizzle_orm_1.sql.join(b2bConditions, (0, drizzle_orm_1.sql) ` AND `)}
    ) AS combined_orders
  `));
    const totalCount = Number(countResult.rows?.[0]?.total ?? 0);
    if (totalCount === 0) {
        return {
            totalCount: 0,
            totalPages: 0,
            pageRows: [],
        };
    }
    const pageResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, type, user_id, created_at, updated_at
    FROM (
      SELECT b2c.id, 'b2c'::text AS type, b2c.user_id, b2c.created_at, b2c.updated_at
      FROM b2c_orders AS b2c
      WHERE ${drizzle_orm_1.sql.join(b2cConditions, (0, drizzle_orm_1.sql) ` AND `)}
      UNION ALL
      SELECT b2b.id, 'b2b'::text AS type, b2b.user_id, b2b.created_at, b2b.updated_at
      FROM b2b_orders AS b2b
      WHERE ${drizzle_orm_1.sql.join(b2bConditions, (0, drizzle_orm_1.sql) ` AND `)}
    ) AS combined_orders
    ORDER BY ${drizzle_orm_1.sql.raw(sortColumn)} ${sortOrder}, created_at ${sortOrder}
    LIMIT ${safeLimit}
    OFFSET ${offset}
  `));
    return {
        totalCount,
        totalPages: Math.ceil(totalCount / safeLimit),
        pageRows: (pageResult.rows || []),
    };
};
const fetchCombinedOrderStatusCounts = async (filters) => {
    const filtersWithoutStatus = { ...filters, status: undefined };
    const b2cConditions = buildOrderConditions('b2c', filtersWithoutStatus);
    const b2bConditions = buildOrderConditions('b2b', filtersWithoutStatus);
    const result = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT order_status AS status, COUNT(*)::int AS count
    FROM (
      SELECT b2c.order_status
      FROM b2c_orders AS b2c
      WHERE ${drizzle_orm_1.sql.join(b2cConditions, (0, drizzle_orm_1.sql) ` AND `)}
      UNION ALL
      SELECT b2b.order_status
      FROM b2b_orders AS b2b
      WHERE ${drizzle_orm_1.sql.join(b2bConditions, (0, drizzle_orm_1.sql) ` AND `)}
    ) AS combined_statuses
    GROUP BY order_status
  `));
    const rows = result.rows || [];
    const all = rows.reduce((total, row) => total + Number(row.count || 0), 0);
    return (0, orderStageStatuses_1.buildOrderStatusCounts)(rows, all);
};
const fetchCombinedOrdersPage = async ({ page = 1, limit = DEFAULT_PAGE_LIMIT, filters = {}, }) => {
    const [{ pageRows, totalCount, totalPages }, statusCounts] = await Promise.all([
        fetchCombinedOrderPageRows({ page, limit, filters }),
        fetchCombinedOrderStatusCounts(filters),
    ]);
    if (pageRows.length === 0) {
        return { orders: [], totalCount, totalPages, statusCounts };
    }
    const b2cIds = pageRows.filter((row) => row.type === 'b2c').map((row) => row.id);
    const b2bIds = pageRows.filter((row) => row.type === 'b2b').map((row) => row.id);
    const [b2cRows, b2bRows] = await Promise.all([
        b2cIds.length
            ? client_1.db.select(orderListSelects_1.b2cOrderListSelect).from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.inArray)(b2cOrders_1.b2c_orders.id, b2cIds))
            : Promise.resolve([]),
        b2bIds.length
            ? client_1.db.select(orderListSelects_1.b2bOrderListSelect).from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.inArray)(b2bOrders_1.b2b_orders.id, b2bIds))
            : Promise.resolve([]),
    ]);
    const b2cMap = new Map(b2cRows.map((row) => [row.id, { ...row, type: 'b2c' }]));
    const b2bMap = new Map(b2bRows.map((row) => [row.id, { ...row, type: 'b2b' }]));
    const orderedRows = pageRows
        .map((row) => (row.type === 'b2c' ? b2cMap.get(row.id) : b2bMap.get(row.id)))
        .filter(Boolean);
    return {
        orders: orderedRows,
        totalCount,
        totalPages,
        statusCounts,
    };
};
exports.fetchCombinedOrdersPage = fetchCombinedOrdersPage;
const fetchOrderUserMetadata = async (userIds) => {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) {
        return {
            userProfilesMap: new Map(),
            usersMap: new Map(),
        };
    }
    const [profileRows, usersRows] = await Promise.all([
        client_1.db
            .select({
            userId: userProfile_1.userProfiles.userId,
            companyInfo: userProfile_1.userProfiles.companyInfo,
            gstDetails: userProfile_1.userProfiles.gstDetails,
            businessType: userProfile_1.userProfiles.businessType,
            approved: userProfile_1.userProfiles.approved,
            onboardingComplete: userProfile_1.userProfiles.onboardingComplete,
        })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.inArray)(userProfile_1.userProfiles.userId, uniqueUserIds)),
        client_1.db
            .select({
            id: users_1.users.id,
            email: users_1.users.email,
            phone: users_1.users.phone,
        })
            .from(users_1.users)
            .where((0, drizzle_orm_1.inArray)(users_1.users.id, uniqueUserIds)),
    ]);
    const userProfilesMap = new Map(profileRows.map((row) => [row.userId, row]));
    const usersMap = new Map(usersRows.map((row) => [row.id, row]));
    return { userProfilesMap, usersMap };
};
exports.fetchOrderUserMetadata = fetchOrderUserMetadata;
