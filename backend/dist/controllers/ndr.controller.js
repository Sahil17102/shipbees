"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminNdrKpis = exports.exportAdminNdrCsv = exports.getMyNdrTimeline = exports.getAdminNdrTimeline = exports.getAdminNdrEvents = exports.getMyNdrEvents = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const ndr_1 = require("../models/schema/ndr");
const ndr_service_1 = require("../models/services/ndr.service");
const csv_1 = require("../utils/csv");
const visibleNdrWhere = (0, drizzle_orm_1.sql) `
  coalesce(${ndr_1.ndr_events.status}, '') <> 'ndr_action'
  AND lower(coalesce(${b2cOrders_1.b2c_orders.order_status}, '')) NOT IN ('pickup_initiated', 'delivered', 'cancelled', 'rto', 'rto_in_transit', 'rto_delivered')
`;
const getMyNdrEvents = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { orderId, page, limit, search, fromDate, toDate, courier, integration_type, attempt_count, status, } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, ndr_service_1.listNdrEvents)(userId, orderId, {
            page: p,
            limit: l,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
        });
        res.json({ success: true, data: rows, totalCount });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.getMyNdrEvents = getMyNdrEvents;
const getAdminNdrEvents = async (req, res) => {
    try {
        const { orderId, page, limit, search, fromDate, toDate, courier, integration_type, attempt_count, status, } = req.query;
        const p = Number(page) || 1;
        const l = Math.min(Number(limit) || 20, 200);
        const { rows, totalCount } = await (0, ndr_service_1.listNdrEventsAdmin)(orderId, {
            page: p,
            limit: l,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            courier: courier || undefined,
            integration_type: integration_type || undefined,
            attempt_count: attempt_count ? Number(attempt_count) : undefined,
            status: status || undefined,
        });
        res.json({ success: true, data: rows, totalCount });
    }
    catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrEvents = getAdminNdrEvents;
const getAdminNdrTimeline = async (req, res) => {
    try {
        const { awb, orderId } = req.query;
        if (!awb && !orderId) {
            return res.status(400).json({ success: false, message: 'Provide awb or orderId' });
        }
        const data = await (0, ndr_service_1.getNdrTimeline)({ awb, orderId });
        return res.json({ success: true, data });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrTimeline = getAdminNdrTimeline;
const getMyNdrTimeline = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { awb, orderId } = req.query;
        if (!awb && !orderId) {
            return res.status(400).json({ success: false, message: 'Provide awb or orderId' });
        }
        let resolvedOrderId;
        if (orderId) {
            const [order] = await client_1.db
                .select({ id: b2cOrders_1.b2c_orders.id })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)))
                .limit(1);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            resolvedOrderId = order.id;
        }
        else if (awb) {
            const [order] = await client_1.db
                .select({ id: b2cOrders_1.b2c_orders.id })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId)))
                .limit(1);
            if (!order) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }
            resolvedOrderId = order.id;
        }
        const data = await (0, ndr_service_1.getNdrTimeline)({ orderId: resolvedOrderId });
        return res.json({
            success: true,
            data: {
                ...data,
                events: data.events.map(({ raw: _raw, ...event }) => event),
            },
        });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getMyNdrTimeline = getMyNdrTimeline;
const exportAdminNdrCsv = async (req, res) => {
    try {
        const { search, fromDate, toDate, courier, integration_type, attempt_count, status } = req.query;
        const { rows } = await (0, ndr_service_1.listNdrEventsAdmin)(undefined, {
            page: 1,
            limit: 100000,
            search: search || '',
            fromDate: fromDate || undefined,
            toDate: toDate || undefined,
            courier: courier || undefined,
            integration_type: integration_type || undefined,
            attempt_count: attempt_count ? Number(attempt_count) : undefined,
            status: status || undefined,
        });
        const headers = [
            'AWB',
            'OrderId',
            'Courier',
            'Integration',
            'Status',
            'CurrentSection',
            'OrderStatus',
            'Reason',
            'Remarks',
            'AttemptNo',
            'CreatedAt',
        ];
        const csv = (0, csv_1.buildCsv)(headers, rows.map((r) => [
            r.awb_number,
            r.order_id,
            r.courier_partner,
            r.integration_type,
            r.status,
            r.current_section,
            r.order_status,
            r.reason,
            r.remarks,
            r.attempt_no,
            r.created_at?.toISOString?.(),
        ]));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="ndr_export.csv"`);
        return res.status(200).send(csv);
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.exportAdminNdrCsv = exportAdminNdrCsv;
const getAdminNdrKpis = async (req, res) => {
    try {
        // Simple KPIs: total NDRs, by status, by courier, unique orders affected
        const totalResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
      WITH visible_ndr AS (
        SELECT
          ${ndr_1.ndr_events.id} AS id,
          ${ndr_1.ndr_events.order_id} AS order_id,
          ${ndr_1.ndr_events.status} AS status,
          ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner
        FROM ${ndr_1.ndr_events}
        LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
        WHERE ${visibleNdrWhere}
      )
      SELECT COUNT(*)::int AS total
      FROM visible_ndr
    `));
        const total = Number(totalResult.rows?.[0]?.total || 0);
        const byStatusResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
      WITH visible_ndr AS (
        SELECT
          ${ndr_1.ndr_events.id} AS id,
          ${ndr_1.ndr_events.order_id} AS order_id,
          ${ndr_1.ndr_events.status} AS status,
          ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner
        FROM ${ndr_1.ndr_events}
        LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
        WHERE ${visibleNdrWhere}
      )
      SELECT status, COUNT(*)::int AS count
      FROM visible_ndr
      GROUP BY status
      ORDER BY count DESC, status ASC
    `));
        const byStatus = byStatusResult.rows || [];
        const byCourierResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
      WITH visible_ndr AS (
        SELECT
          ${ndr_1.ndr_events.id} AS id,
          ${ndr_1.ndr_events.order_id} AS order_id,
          ${ndr_1.ndr_events.status} AS status,
          ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner
        FROM ${ndr_1.ndr_events}
        LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
        WHERE ${visibleNdrWhere}
      )
      SELECT courier_partner AS courier, COUNT(*)::int AS count
      FROM visible_ndr
      GROUP BY courier_partner
      ORDER BY count DESC, courier ASC
    `));
        const byCourier = byCourierResult.rows || [];
        const ordersAffectedResult = (await client_1.db.execute((0, drizzle_orm_1.sql) `
      WITH visible_ndr AS (
        SELECT
          ${ndr_1.ndr_events.id} AS id,
          ${ndr_1.ndr_events.order_id} AS order_id,
          ${ndr_1.ndr_events.status} AS status,
          ${b2cOrders_1.b2c_orders.courier_partner} AS courier_partner
        FROM ${ndr_1.ndr_events}
        LEFT JOIN ${b2cOrders_1.b2c_orders} ON ${ndr_1.ndr_events.order_id} = ${b2cOrders_1.b2c_orders.id}
        WHERE ${visibleNdrWhere}
      )
      SELECT COUNT(DISTINCT order_id)::int AS ordersAffected
      FROM visible_ndr
    `));
        const ordersAffected = Number(ordersAffectedResult.rows?.[0]?.ordersAffected || 0);
        return res
            .status(200)
            .json({ success: true, data: { total, byStatus, byCourier, ordersAffected } });
    }
    catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
exports.getAdminNdrKpis = getAdminNdrKpis;
