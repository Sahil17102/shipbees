"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordNdrEvent = recordNdrEvent;
exports.listNdrEvents = listNdrEvents;
exports.listNdrEventsAdmin = listNdrEventsAdmin;
exports.getNdrTimeline = getNdrTimeline;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const userProfile_1 = require("../schema/userProfile");
const ndr_1 = require("../schema/ndr");
const trackingEvents_1 = require("../schema/trackingEvents");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const currentSectionExpr = (0, drizzle_orm_1.sql) `CASE
  WHEN lower(coalesce(${ndr_1.ndr_events.status}, '')) = 'ndr_action' THEN 'Shipment'
  WHEN lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) IN ('cancelled', 'cancellation_requested') THEN 'Cancelled'
  WHEN lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) LIKE 'rto%' THEN 'RTO'
  WHEN lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) = 'delivered' THEN 'Delivered'
  WHEN lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) IN ('shipment_created', 'pickup_initiated', 'booked', 'pending', 'in_transit', 'out_for_delivery') THEN 'Shipment'
  WHEN lower(coalesce(${ndr_1.ndr_events.status}, '')) IN ('ndr', 'undelivered', 'lost', 'address_issue', 'nsl') THEN 'NDR'
  ELSE 'Other'
END`;
const hiddenOrderStatusesSql = `'shipment_created', 'pickup_initiated', 'booked', 'pending', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'rto', 'rto_in_transit', 'rto_delivered'`;
const buildLatestVisibilityClause = () => (0, drizzle_orm_1.sql) `
  AND coalesce(latest.status, '') <> 'ndr_action'
  AND lower(coalesce(latest.order_status, '')) NOT IN (${drizzle_orm_1.sql.raw(hiddenOrderStatusesSql)})
`;
const buildLatestSearchClause = (search) => {
    if (!search)
        return (0, drizzle_orm_1.sql) ``;
    const term = `%${search}%`;
    return (0, drizzle_orm_1.sql) `
    AND (
      coalesce(latest.awb_number, '') ILIKE ${term}
      OR (latest.order_id::text) ILIKE ${term}
      OR coalesce(latest.order_number, '') ILIKE ${term}
      OR coalesce(latest.buyer_name, '') ILIKE ${term}
      OR coalesce(latest.buyer_phone, '') ILIKE ${term}
      OR coalesce(latest.reason, '') ILIKE ${term}
      OR coalesce(latest.remarks, '') ILIKE ${term}
    )
  `;
};
const buildLatestDateClause = (fromDate, toDate) => {
    const clauses = [];
    if (fromDate) {
        const date = new Date(fromDate);
        if (!Number.isNaN(date.getTime())) {
            clauses.push((0, drizzle_orm_1.sql) `AND latest.created_at >= ${date}`);
        }
    }
    if (toDate) {
        const date = new Date(toDate);
        if (!Number.isNaN(date.getTime())) {
            clauses.push((0, drizzle_orm_1.sql) `AND latest.created_at <= ${date}`);
        }
    }
    return clauses.length ? drizzle_orm_1.sql.join(clauses, (0, drizzle_orm_1.sql) ``) : (0, drizzle_orm_1.sql) ``;
};
const buildLatestStatusClause = (status) => status ? (0, drizzle_orm_1.sql) `AND latest.status ILIKE ${`%${status}%`}` : (0, drizzle_orm_1.sql) ``;
const buildLatestCourierClause = (courier) => courier ? (0, drizzle_orm_1.sql) `AND latest.courier_partner ILIKE ${`%${courier}%`}` : (0, drizzle_orm_1.sql) ``;
const buildLatestIntegrationClause = (integration_type) => integration_type ? (0, drizzle_orm_1.sql) `AND latest.integration_type ILIKE ${`%${integration_type}%`}` : (0, drizzle_orm_1.sql) ``;
const buildLatestAttemptClause = (attempt_count) => attempt_count ? (0, drizzle_orm_1.sql) `AND latest.attempt_no = ${String(attempt_count)}` : (0, drizzle_orm_1.sql) ``;
async function recordNdrEvent(params) {
    const { orderId, userId, awbNumber, status, reason, remarks, attemptNo, payload } = params;
    const [inserted] = await client_1.db
        .insert(ndr_1.ndr_events)
        .values({
        order_id: orderId,
        user_id: userId,
        awb_number: awbNumber || null,
        status,
        reason: reason || null,
        remarks: remarks || null,
        attempt_no: attemptNo || null,
        payload: payload || null,
    })
        .returning();
    (0, webhookDelivery_service_1.sendWebhookEvent)(userId, 'order.ndr', {
        order_id: orderId,
        awb_number: awbNumber,
        status,
        reason,
        remarks,
        attempt_no: attemptNo,
        created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
    }).catch((err) => {
        console.error('Failed to send NDR webhook event:', err);
    });
    return inserted;
}
async function listNdrEvents(userId, orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {};
    const whereBase = orderId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId), (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, orderId))
        : (0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId);
    const offset = (page - 1) * limit;
    const baseCte = (0, drizzle_orm_1.sql) `
    WITH latest AS (
      SELECT DISTINCT ON (${ndr_1.ndr_events.order_id})
        ${ndr_1.ndr_events.id} AS id,
        ${ndr_1.ndr_events.awb_number} AS awb_number,
        ${ndr_1.ndr_events.order_id} AS order_id,
        ${ndr_1.ndr_events.user_id} AS user_id,
        ${ndr_1.ndr_events.status} AS status,
        ${ndr_1.ndr_events.reason} AS reason,
        ${ndr_1.ndr_events.remarks} AS remarks,
        ${ndr_1.ndr_events.attempt_no} AS attempt_no,
        ${ndr_1.ndr_events.created_at} AS created_at,
        ${ndr_1.ndr_events.updated_at} AS last_event_time,
        ${b2cOrders_1.b2c_orders.order_number} AS order_number,
        ${b2cOrders_1.b2c_orders.buyer_name} AS buyer_name,
        ${b2cOrders_1.b2c_orders.buyer_phone} AS buyer_phone,
        ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner,
        ${b2cOrders_1.b2c_orders.order_status} AS order_status,
        ${currentSectionExpr} AS current_section,
        CASE
          WHEN lower(coalesce(${b2cOrders_1.b2c_orders.integration_type}, '')) = 'manual' THEN 'shipray'
          ELSE ${b2cOrders_1.b2c_orders.integration_type}
        END AS integration_type
      FROM ${ndr_1.ndr_events}
      LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
      WHERE ${whereBase}
      ORDER BY ${ndr_1.ndr_events.order_id}, ${ndr_1.ndr_events.created_at} DESC, ${ndr_1.ndr_events.id} DESC
    )
  `;
    const countResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    ${baseCte}
    SELECT COUNT(*)::int AS total
    FROM latest
    WHERE 1 = 1
    ${buildLatestSearchClause(search)}
    ${buildLatestDateClause(fromDate, toDate)}
    ${buildLatestVisibilityClause()}
  `));
    const totalCount = Number(countResult.rows?.[0]?.total || 0);
    if (totalCount === 0) {
        return { rows: [], totalCount: 0 };
    }
    const rowsResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    ${baseCte}
    SELECT
      id,
      awb_number,
      order_id,
      status,
      reason,
      remarks,
      attempt_no,
      created_at,
      last_event_time,
      order_number,
      buyer_name,
      buyer_phone,
      courier_partner,
      order_status,
      current_section,
      integration_type
    FROM latest
    WHERE 1 = 1
    ${buildLatestSearchClause(search)}
    ${buildLatestDateClause(fromDate, toDate)}
    ${buildLatestVisibilityClause()}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `));
    return { rows: rowsResult.rows || [], totalCount };
}
async function listNdrEventsAdmin(orderId, params) {
    const { page = 1, limit = 20, search = '', fromDate, toDate, courier, integration_type, attempt_count, status, } = params || {};
    const base = orderId ? (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, orderId) : (0, drizzle_orm_1.sql) `true`;
    const offset = (page - 1) * limit;
    const baseCte = (0, drizzle_orm_1.sql) `
    WITH latest AS (
      SELECT DISTINCT ON (${ndr_1.ndr_events.order_id})
        ${ndr_1.ndr_events.id} AS id,
        ${ndr_1.ndr_events.awb_number} AS awb_number,
        ${ndr_1.ndr_events.order_id} AS order_id,
        ${ndr_1.ndr_events.user_id} AS user_id,
        ${ndr_1.ndr_events.status} AS status,
        ${ndr_1.ndr_events.reason} AS reason,
        ${ndr_1.ndr_events.remarks} AS remarks,
        ${ndr_1.ndr_events.attempt_no} AS attempt_no,
        ${ndr_1.ndr_events.created_at} AS created_at,
        ${b2cOrders_1.b2c_orders.order_number} AS order_number,
        ${b2cOrders_1.b2c_orders.buyer_name} AS buyer_name,
        ${b2cOrders_1.b2c_orders.buyer_phone} AS buyer_phone,
        ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner,
        ${b2cOrders_1.b2c_orders.order_status} AS order_status,
        ${currentSectionExpr} AS current_section,
        ${b2cOrders_1.b2c_orders.integration_type} AS integration_type,
        ${b2cOrders_1.b2c_orders.user_id} AS merchant_id,
        ${userProfile_1.userProfiles.companyInfo} ->> 'companyName' AS merchant_name,
        ${ndr_1.ndr_events.updated_at} AS last_event_time,
        CASE
          WHEN ${ndr_1.ndr_events.payload} ->> 'source' = 'admin_manual' THEN 'admin'
          ELSE 'webhook'
        END AS source
      FROM ${ndr_1.ndr_events}
      LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
      LEFT JOIN ${userProfile_1.userProfiles} ON ${userProfile_1.userProfiles.userId} = ${b2cOrders_1.b2c_orders.user_id}
      WHERE ${base}
      ORDER BY ${ndr_1.ndr_events.order_id}, ${ndr_1.ndr_events.created_at} DESC, ${ndr_1.ndr_events.id} DESC
    )
  `;
    const countResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    ${baseCte}
    SELECT COUNT(*)::int AS total
    FROM latest
    WHERE 1 = 1
    ${buildLatestSearchClause(search)}
    ${buildLatestDateClause(fromDate, toDate)}
    ${buildLatestStatusClause(status)}
    ${buildLatestCourierClause(courier)}
    ${buildLatestIntegrationClause(integration_type)}
    ${buildLatestAttemptClause(attempt_count)}
    ${buildLatestVisibilityClause()}
  `));
    const totalCount = Number(countResult.rows?.[0]?.total || 0);
    if (totalCount === 0) {
        return { rows: [], totalCount: 0 };
    }
    const rowsResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
    ${baseCte}
    SELECT
      id,
      awb_number,
      order_id,
      status,
      reason,
      remarks,
      attempt_no,
      created_at,
      order_number,
      buyer_name,
      buyer_phone,
      courier_partner,
      order_status,
      current_section,
      integration_type,
      merchant_id,
      merchant_name,
      last_event_time,
      source
    FROM latest
    WHERE 1 = 1
    ${buildLatestSearchClause(search)}
    ${buildLatestDateClause(fromDate, toDate)}
    ${buildLatestStatusClause(status)}
    ${buildLatestCourierClause(courier)}
    ${buildLatestIntegrationClause(integration_type)}
    ${buildLatestAttemptClause(attempt_count)}
    ${buildLatestVisibilityClause()}
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `));
    return { rows: rowsResult.rows || [], totalCount };
}
async function getNdrTimeline(params) {
    const { awb, orderId } = params;
    let orderRow = null;
    if (orderId) {
        const [o] = await client_1.db
            .select({ id: b2cOrders_1.b2c_orders.id, awb_number: b2cOrders_1.b2c_orders.awb_number })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId))
            .limit(1);
        if (o)
            orderRow = o;
    }
    else if (awb) {
        const [o] = await client_1.db
            .select({ id: b2cOrders_1.b2c_orders.id, awb_number: b2cOrders_1.b2c_orders.awb_number })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb))
            .limit(1);
        if (o)
            orderRow = o;
    }
    const resolvedOrderId = orderRow?.id;
    const resolvedAwb = orderRow?.awb_number || awb;
    const ndr = await client_1.db
        .select({
        type: (0, drizzle_orm_1.sql) `'ndr'`,
        at: ndr_1.ndr_events.created_at,
        status: ndr_1.ndr_events.status,
        remarks: ndr_1.ndr_events.remarks,
        reason: ndr_1.ndr_events.reason,
        attempt_no: ndr_1.ndr_events.attempt_no,
        raw: ndr_1.ndr_events.payload,
    })
        .from(ndr_1.ndr_events)
        .where(resolvedOrderId ? (0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, resolvedOrderId) : (0, drizzle_orm_1.sql) `false`);
    const tracking = resolvedAwb
        ? await client_1.db
            .select({
            type: (0, drizzle_orm_1.sql) `'tracking'`,
            at: trackingEvents_1.tracking_events.created_at,
            status: trackingEvents_1.tracking_events.status_code,
            remarks: trackingEvents_1.tracking_events.status_text,
            reason: (0, drizzle_orm_1.sql) `null`,
            attempt_no: (0, drizzle_orm_1.sql) `null`,
            raw: trackingEvents_1.tracking_events.raw,
        })
            .from(trackingEvents_1.tracking_events)
            .where((0, drizzle_orm_1.eq)(trackingEvents_1.tracking_events.awb_number, resolvedAwb))
        : [];
    const combined = [...ndr, ...tracking].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return { orderId: resolvedOrderId, awb: resolvedAwb, events: combined };
}
