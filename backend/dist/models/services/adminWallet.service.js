"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsolidatedWalletMisExportRows = exports.getConsolidatedWalletMisReport = exports.WALLET_MIS_TRANSACTION_AGAINST_OPTIONS = exports.getWalletTransactionsByUserId = exports.getWalletByUserId = exports.getAllWallets = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const wallet_1 = require("../schema/wallet");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const walletTransactionDetails_service_1 = require("./walletTransactionDetails.service");
const walletTransactionCategory_1 = require("../../utils/walletTransactionCategory");
const getAllWallets = async ({ page = 1, limit = 20, search = '', sortBy = 'updatedAt', sortOrder = 'desc', }) => {
    const offset = (page - 1) * limit;
    const filters = [];
    // Search filter
    if (search.trim()) {
        const pattern = `%${search.trim()}%`;
        filters.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'brandName', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'contactPerson', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'contactEmail', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'businessName', '')`, pattern), (0, drizzle_orm_1.ilike)(users_1.users.email, pattern)));
    }
    // Sort mapping
    const sortColumns = {
        balance: wallet_1.wallets.balance,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        email: users_1.users.email,
        companyName: (0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo} ->> 'brandName'`,
    };
    const sortColumn = sortColumns[sortBy] ?? wallet_1.wallets.updatedAt;
    const orderBy = sortOrder === 'asc' ? sortColumn : (0, drizzle_orm_1.desc)(sortColumn);
    // Get total count
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(filters.length > 0 ? (0, drizzle_orm_1.and)(...filters) : undefined);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    // Get wallets with user info
    const walletsData = await client_1.db
        .select({
        id: wallet_1.wallets.id,
        userId: wallet_1.wallets.userId,
        balance: wallet_1.wallets.balance,
        currency: wallet_1.wallets.currency,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        userEmail: users_1.users.email,
        userRole: users_1.users.role,
        companyInfo: userProfile_1.userProfiles.companyInfo,
    })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(filters.length > 0 ? (0, drizzle_orm_1.and)(...filters) : undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    return {
        data: walletsData,
        totalCount,
        page,
        limit,
    };
};
exports.getAllWallets = getAllWallets;
const getWalletByUserId = async (userId) => {
    const walletData = await client_1.db
        .select({
        id: wallet_1.wallets.id,
        userId: wallet_1.wallets.userId,
        balance: wallet_1.wallets.balance,
        currency: wallet_1.wallets.currency,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        userEmail: users_1.users.email,
        userRole: users_1.users.role,
        companyInfo: userProfile_1.userProfiles.companyInfo,
    })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId))
        .limit(1);
    if (!walletData[0]) {
        throw new Error('Wallet not found for this user');
    }
    return walletData[0];
};
exports.getWalletByUserId = getWalletByUserId;
const getWalletTransactionsByUserId = async ({ userId, page = 1, limit = 50, type, dateFrom, dateTo, category, }) => {
    const offset = (page - 1) * limit;
    // Get wallet
    const userWallet = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
    if (!userWallet[0]) {
        throw new Error('Wallet not found for this user');
    }
    // Build filters
    const conditions = [(0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, userWallet[0].id)];
    if (type)
        conditions.push((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, type));
    if (dateFrom)
        conditions.push((0, drizzle_orm_1.gte)(wallet_1.walletTransactions.created_at, dateFrom));
    if (dateTo)
        conditions.push((0, drizzle_orm_1.lte)(wallet_1.walletTransactions.created_at, dateTo));
    if (category)
        conditions.push((0, walletTransactionCategory_1.walletTransactionCategoryCondition)(category));
    const filter = (0, drizzle_orm_1.and)(...conditions);
    // Get total count
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(wallet_1.walletTransactions)
        .where(filter);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    // Get transactions
    const transactions = await client_1.db
        .select()
        .from(wallet_1.walletTransactions)
        .where(filter)
        .orderBy((0, drizzle_orm_1.desc)(wallet_1.walletTransactions.created_at))
        .limit(limit)
        .offset(offset);
    const enrichedTransactions = await (0, walletTransactionDetails_service_1.enrichWalletTransactionsWithShipmentDetails)(userId, transactions, {
        masked: false,
    });
    return {
        wallet: userWallet[0],
        transactions: enrichedTransactions,
        totalCount,
        page,
        limit,
    };
};
exports.getWalletTransactionsByUserId = getWalletTransactionsByUserId;
exports.WALLET_MIS_TRANSACTION_AGAINST_OPTIONS = [
    'COD',
    'RTO',
    'Shipping Charges',
    'Wallet Recharge',
    'Weight Discrepancy',
    'Adjustments',
    'WhatsApp Service Charges',
];
const WALLET_MIS_MAX_LIMIT = 5000;
const clampPositiveInt = (value, fallback, max = WALLET_MIS_MAX_LIMIT) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.floor(parsed), max);
};
const isValidMisTransactionAgainst = (value) => exports.WALLET_MIS_TRANSACTION_AGAINST_OPTIONS.includes(value);
const normalizeMoney = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};
const normalizeWeight = (value) => {
    if (value === null || value === undefined || value === '')
        return '';
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(3) : String(value);
};
const toIsoDate = (value) => {
    if (!value)
        return '';
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
};
const walletMisBaseSql = `
WITH wallet_mis_base AS (
  SELECT
    wt.id::text AS id,
    w."userId"::text AS customer_id,
    COALESCE(
      NULLIF(up."companyInfo" ->> 'brandName', ''),
      NULLIF(up."companyInfo" ->> 'businessName', ''),
      NULLIF(up."companyInfo" ->> 'contactPerson', ''),
      NULLIF(up."companyInfo" ->> 'name', ''),
      NULLIF(u.email, ''),
      w."userId"::text
    ) AS customer_name,
    u.email AS customer_email,
    wt.created_at AS transaction_date,
    wt.amount,
    wt.currency,
    wt.type::text AS type,
    wt.reason,
    wt.ref,
    wt.meta,
    lower(coalesce(wt.reason, '')) AS reason_lower,
    lower(concat_ws(' ', coalesce(wt.reason, ''), coalesce(wt.ref, ''), coalesce(wt.meta::text, ''))) AS category_signal,
    COALESCE(
      NULLIF(b2c.awb_number, ''),
      NULLIF(b2b.awb_number, ''),
      NULLIF(wt.meta ->> 'awb_number', ''),
      NULLIF(wt.meta ->> 'awbNumber', ''),
      NULLIF(wt.meta ->> 'awb', ''),
      NULLIF(wt.meta ->> 'waybill', ''),
      NULLIF(wt.meta ->> 'waybill_number', '')
    ) AS awb,
    COALESCE(
      NULLIF(b2c.courier_partner, ''),
      NULLIF(b2b.courier_partner, ''),
      NULLIF(wt.meta ->> 'courier_name', ''),
      NULLIF(wt.meta ->> 'courier_partner', ''),
      NULLIF(wt.meta ->> 'integration_type', '')
    ) AS courier_partner_name,
    COALESCE(
      b2c.charged_weight,
      b2b.charged_weight,
      CASE
        WHEN (wt.meta ->> 'charged_weight') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (wt.meta ->> 'charged_weight')::numeric
        WHEN (wt.meta ->> 'chargedWeight') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (wt.meta ->> 'chargedWeight')::numeric
      END,
      b2c.weight,
      b2b.weight,
      CASE
        WHEN (wt.meta ->> 'declared_weight') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (wt.meta ->> 'declared_weight')::numeric
        WHEN (wt.meta ->> 'declaredWeight') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (wt.meta ->> 'declaredWeight')::numeric
      END
    ) AS weight
  FROM wallet_transactions wt
  INNER JOIN wallets w ON w.id = wt.wallet_id
  LEFT JOIN users u ON u.id = w."userId"
  LEFT JOIN user_profiles up ON up."userId" = w."userId"
  LEFT JOIN LATERAL (
    SELECT
      o.id::text,
      o.order_number,
      o.awb_number,
      o.courier_partner,
      o.charged_weight,
      o.weight,
      o.created_at
    FROM b2c_orders o
    WHERE
      o.user_id = w."userId"
      AND (
        o.id::text = wt.ref
        OR o.order_id = wt.ref
        OR o.order_number = wt.ref
        OR o.shipment_id = wt.ref
        OR o.awb_number = wt.ref
        OR o.id::text = wt.meta ->> 'order_id'
        OR o.id::text = wt.meta ->> 'orderId'
        OR o.id::text = wt.meta ->> 'orderUuid'
        OR o.id::text = wt.meta ->> 'order_uuid'
        OR o.id::text = wt.meta ->> 'original_order_id'
        OR o.order_id = wt.meta ->> 'order_id'
        OR o.order_id = wt.meta ->> 'orderId'
        OR o.order_id = wt.meta ->> 'original_order_id'
        OR o.order_number = wt.meta ->> 'order_number'
        OR o.order_number = wt.meta ->> 'orderNumber'
        OR o.awb_number = wt.meta ->> 'awb_number'
        OR o.awb_number = wt.meta ->> 'awbNumber'
        OR o.awb_number = wt.meta ->> 'awb'
        OR o.awb_number = wt.meta ->> 'waybill'
        OR o.shipment_id = wt.meta ->> 'shipment_id'
        OR o.shipment_id = wt.meta ->> 'shipmentId'
        OR lower(o.order_number) = lower(NULLIF(substring(wt.reason from 'order #?([A-Za-z0-9._-]+)'), ''))
        OR lower(o.order_number) = lower(NULLIF(substring(wt.reason from '\\(([^)]+)\\)'), ''))
      )
    ORDER BY o.created_at DESC NULLS LAST
    LIMIT 1
  ) b2c ON true
  LEFT JOIN LATERAL (
    SELECT
      o.id::text,
      o.order_number,
      o.awb_number,
      o.courier_partner,
      o.charged_weight,
      o.weight,
      o.created_at
    FROM b2b_orders o
    WHERE
      o.user_id = w."userId"
      AND (
        o.id::text = wt.ref
        OR o.order_id = wt.ref
        OR o.order_number = wt.ref
        OR o.shipment_id = wt.ref
        OR o.awb_number = wt.ref
        OR o.id::text = wt.meta ->> 'order_id'
        OR o.id::text = wt.meta ->> 'orderId'
        OR o.id::text = wt.meta ->> 'orderUuid'
        OR o.id::text = wt.meta ->> 'order_uuid'
        OR o.id::text = wt.meta ->> 'original_order_id'
        OR o.order_id = wt.meta ->> 'order_id'
        OR o.order_id = wt.meta ->> 'orderId'
        OR o.order_id = wt.meta ->> 'original_order_id'
        OR o.order_number = wt.meta ->> 'order_number'
        OR o.order_number = wt.meta ->> 'orderNumber'
        OR o.awb_number = wt.meta ->> 'awb_number'
        OR o.awb_number = wt.meta ->> 'awbNumber'
        OR o.awb_number = wt.meta ->> 'awb'
        OR o.awb_number = wt.meta ->> 'waybill'
        OR o.shipment_id = wt.meta ->> 'shipment_id'
        OR o.shipment_id = wt.meta ->> 'shipmentId'
        OR lower(o.order_number) = lower(NULLIF(substring(wt.reason from 'order #?([A-Za-z0-9._-]+)'), ''))
        OR lower(o.order_number) = lower(NULLIF(substring(wt.reason from '\\(([^)]+)\\)'), ''))
      )
    ORDER BY o.created_at DESC NULLS LAST
    LIMIT 1
  ) b2b ON true
),
wallet_mis_classified AS (
  SELECT
    *,
    CASE
      WHEN category_signal LIKE '%whatsapp%' THEN 'WhatsApp Service Charges'
      WHEN category_signal SIMILAR TO '%(wallet recharge|wallet_topup|wallet topup|topup)%'
        THEN 'Wallet Recharge'
      WHEN category_signal SIMILAR TO '%(weight discrepancy|weight dispute|weight_disc)%'
        THEN 'Weight Discrepancy'
      WHEN category_signal SIMILAR TO '%(rto|reverse shipment|reverse_shipment|reverse shipping)%'
        THEN 'RTO'
      WHEN category_signal LIKE '%cod%' THEN 'COD'
      WHEN category_signal SIMILAR TO '%(shipping|shipment charge|order payment|freight)%'
        THEN 'Shipping Charges'
      ELSE 'Adjustments'
    END AS transaction_against
  FROM wallet_mis_base
)
`;
const buildWalletMisFilters = (params) => {
    const filters = [];
    const values = [];
    const push = (condition, value) => {
        values.push(value);
        filters.push(condition.replace('?', `$${values.length}`));
    };
    const pushRepeated = (condition, value, count) => {
        const placeholders = [];
        for (let i = 0; i < count; i += 1) {
            values.push(value);
            placeholders.push(`$${values.length}`);
        }
        let index = 0;
        filters.push(condition.replace(/\?/g, () => placeholders[index++] || '?'));
    };
    if (params.dateFrom)
        push('transaction_date >= ?', params.dateFrom);
    if (params.dateTo)
        push('transaction_date <= ?', params.dateTo);
    if (params.customerId?.trim())
        push('customer_id = ?', params.customerId.trim());
    if (params.type)
        push('type = ?', params.type);
    if (params.transactionAgainst?.trim() && isValidMisTransactionAgainst(params.transactionAgainst)) {
        push('transaction_against = ?', params.transactionAgainst.trim());
    }
    if (params.search?.trim()) {
        pushRepeated(`(
        customer_name ILIKE ?
        OR customer_email ILIKE ?
        OR customer_id ILIKE ?
        OR COALESCE(reason, '') ILIKE ?
        OR COALESCE(ref, '') ILIKE ?
        OR COALESCE(awb, '') ILIKE ?
      )`, `%${params.search.trim()}%`, 6);
    }
    if (params.awb?.trim())
        push('COALESCE(awb, \'\') ILIKE ?', `%${params.awb.trim()}%`);
    if (params.courier?.trim()) {
        push('COALESCE(courier_partner_name, \'\') ILIKE ?', `%${params.courier.trim()}%`);
    }
    if (typeof params.minWeight === 'number' && Number.isFinite(params.minWeight)) {
        push('weight >= ?', params.minWeight);
    }
    if (typeof params.maxWeight === 'number' && Number.isFinite(params.maxWeight)) {
        push('weight <= ?', params.maxWeight);
    }
    if (params.shipmentOnly) {
        filters.push(`(
      awb IS NOT NULL
      OR courier_partner_name IS NOT NULL
      OR reason_lower LIKE '%shipment%'
      OR reason_lower LIKE '%order payment%'
      OR reason_lower LIKE '%cod service charges%'
      OR reason_lower LIKE '%weight discrepancy%'
      OR reason_lower LIKE '%rto freight%'
      OR reason_lower LIKE '%reverse%'
    )`);
    }
    return {
        whereSql: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
        values,
    };
};
const mapWalletMisRow = (row) => ({
    id: row.id,
    customerName: row.customer_name || '',
    customerId: row.customer_id || '',
    customerEmail: row.customer_email || '',
    transactionDate: row.transaction_date,
    walletTransactionAmount: normalizeMoney(row.amount),
    transactionAgainst: row.transaction_against || '',
    transactionType: String(row.type || '').toUpperCase(),
    rawTransactionType: row.type || '',
    rawReason: row.reason || '',
    reference: row.ref || '',
    awb: row.awb || '',
    courierPartnerName: row.courier_partner_name || '',
    weight: normalizeWeight(row.weight),
    currency: row.currency || 'INR',
});
const getConsolidatedWalletMisReport = async (params = {}) => {
    const page = clampPositiveInt(params.page, 1, 100000);
    const limit = clampPositiveInt(params.limit, 50);
    const offset = (page - 1) * limit;
    const { whereSql, values } = buildWalletMisFilters(params);
    const countSql = `
    ${walletMisBaseSql}
    SELECT count(*)::int AS count
    FROM wallet_mis_classified
    ${whereSql}
  `;
    const dataSql = `
    ${walletMisBaseSql}
    SELECT
      id,
      customer_id,
      customer_name,
      customer_email,
      transaction_date,
      amount,
      currency,
      type,
      reason,
      ref,
      transaction_against,
      awb,
      courier_partner_name,
      weight
    FROM wallet_mis_classified
    ${whereSql}
    ORDER BY transaction_date DESC NULLS LAST, id DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;
    const [countResult, dataResult] = await Promise.all([
        client_1.pool.query(countSql, values),
        client_1.pool.query(dataSql, [...values, limit, offset]),
    ]);
    return {
        data: dataResult.rows.map(mapWalletMisRow),
        totalCount: Number(countResult.rows[0]?.count || 0),
        page,
        limit,
        transactionAgainstOptions: exports.WALLET_MIS_TRANSACTION_AGAINST_OPTIONS,
    };
};
exports.getConsolidatedWalletMisReport = getConsolidatedWalletMisReport;
const getConsolidatedWalletMisExportRows = async (params = {}) => {
    const result = await (0, exports.getConsolidatedWalletMisReport)({
        ...params,
        page: 1,
        limit: clampPositiveInt(params.limit, WALLET_MIS_MAX_LIMIT),
    });
    return result.data.map((row) => [
        row.customerName,
        row.customerId,
        toIsoDate(row.transactionDate),
        row.walletTransactionAmount,
        row.transactionAgainst,
        row.transactionType,
        row.awb,
        row.courierPartnerName,
        row.weight,
    ]);
};
exports.getConsolidatedWalletMisExportRows = getConsolidatedWalletMisExportRows;
