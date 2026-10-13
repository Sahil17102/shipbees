"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOrderStatusCounts = exports.expandOrderStatusFilter = exports.SHIPMENT_STAGE_STATUSES = void 0;
exports.SHIPMENT_STAGE_STATUSES = {
    pending: ['pending', 'new', 'draft'],
    booked: ['booked', 'shipment_created'],
    pickup_initiated: ['pickup_initiated', 'picked_up', 'pickup_scheduled', 'manifested'],
    manifest_failed: ['manifest_failed'],
    in_transit: ['in_transit'],
    out_for_delivery: ['out_for_delivery'],
    delivered: ['delivered', 'ndr_delivered'],
    ndr: ['ndr', 'undelivered'],
    rto_in_transit: ['rto', 'rto_in_transit'],
    rto_delivered: ['rto_delivered'],
    cancelled: ['cancelled', 'cancellation_requested'],
};
const normalizeStatus = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
const expandOrderStatusFilter = (status) => {
    const requested = (Array.isArray(status) ? status : String(status || '').split(','))
        .map(normalizeStatus)
        .filter(Boolean);
    return Array.from(new Set(requested.flatMap((value) => exports.SHIPMENT_STAGE_STATUSES[value] || [value])));
};
exports.expandOrderStatusFilter = expandOrderStatusFilter;
const buildOrderStatusCounts = (rows, all) => {
    const counts = { all };
    rows.forEach((row) => {
        const status = normalizeStatus(row.status);
        if (status)
            counts[status] = Number(row.count || 0);
    });
    return counts;
};
exports.buildOrderStatusCounts = buildOrderStatusCounts;
