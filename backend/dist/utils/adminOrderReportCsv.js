"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCourierOrderReportRows = exports.toMonthlyOrderReportRows = exports.toDailyOrderReportRows = exports.toUserWiseReportRows = exports.ORDER_REPORT_HEADERS = exports.USER_WISE_REPORT_HEADERS = void 0;
const adminOrderExportCsv_1 = require("./adminOrderExportCsv");
const numberValue = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => value.toFixed(2);
const dateKey = (order) => {
    const raw = order.created_at || order.order_date;
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime()))
        return 'Unknown';
    return date.toISOString().slice(0, 10);
};
const monthKey = (order) => dateKey(order).slice(0, 7);
const status = (order) => String(order.order_status || '').trim().toLowerCase();
const isRto = (order) => status(order) === 'rto' || status(order).startsWith('rto_');
const revenueFor = (order) => numberValue(order.freight_charges ?? order.shipping_charges ?? order.order_amount);
const codCollectionFor = (order) => String(order.order_type || '').toLowerCase() === 'cod' ? numberValue(order.order_amount) : 0;
const sellerIdFor = (order) => String(order.user_id || '');
const sellerEmailFor = (order) => String(order.merchantEmail || '');
const courierFor = (order) => String(order.courier_partner || order.integration_type || 'Unassigned');
const groupRows = (orders, keyFor, labelFor, extraFor) => {
    const groups = new Map();
    for (const order of orders) {
        const key = keyFor(order);
        const group = groups.get(key);
        if (group)
            group.orders.push(order);
        else
            groups.set(key, { label: labelFor(order), orders: [order], first: order });
    }
    return Array.from(groups.values()).map(({ label, orders: grouped, first }) => {
        const shipmentCount = grouped.length;
        const rtoCount = grouped.filter(isRto).length;
        const revenue = grouped.reduce((sum, order) => sum + revenueFor(order), 0);
        const codCollection = grouped.reduce((sum, order) => sum + codCollectionFor(order), 0);
        return [
            label,
            sellerIdFor(first),
            (0, adminOrderExportCsv_1.getAdminOrderSellerName)(first),
            sellerEmailFor(first),
            shipmentCount,
            money(revenue),
            money(codCollection),
            grouped.filter((order) => status(order) === 'delivered').length,
            rtoCount,
            shipmentCount ? `${((rtoCount / shipmentCount) * 100).toFixed(2)}%` : '0.00%',
            ...extraFor(first),
        ];
    });
};
exports.USER_WISE_REPORT_HEADERS = [
    'Seller ID',
    'Seller Name',
    'Seller Email',
    'Shipment Count',
    'Revenue',
    'COD Collection',
    'Delivered Shipments',
    'RTO Shipments',
    'RTO %',
];
exports.ORDER_REPORT_HEADERS = [
    'Report Type',
    'Date / Month / Courier',
    'Shipment Count',
    'Revenue',
    'COD Collection',
    'Delivered Shipments',
    'RTO Shipments',
    'RTO %',
];
const toUserWiseReportRows = (orders) => groupRows(orders, sellerIdFor, (order) => sellerIdFor(order), () => []).map((row) => row.slice(1));
exports.toUserWiseReportRows = toUserWiseReportRows;
const toDailyOrderReportRows = (orders) => groupRows(orders, dateKey, dateKey, () => []).map((row) => row);
exports.toDailyOrderReportRows = toDailyOrderReportRows;
const toMonthlyOrderReportRows = (orders) => groupRows(orders, monthKey, monthKey, () => []).map((row) => row);
exports.toMonthlyOrderReportRows = toMonthlyOrderReportRows;
const toCourierOrderReportRows = (orders) => groupRows(orders, courierFor, courierFor, (order) => [courierFor(order)]).map((row) => row);
exports.toCourierOrderReportRows = toCourierOrderReportRows;
