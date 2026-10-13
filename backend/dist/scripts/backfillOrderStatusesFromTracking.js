"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillOrderStatusesFromTracking = backfillOrderStatusesFromTracking;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const trackingEvents_1 = require("../models/schema/trackingEvents");
const terminalStatuses = new Set(['delivered', 'rto_delivered', 'cancelled', 'lost']);
const normalizeTrackingStatus = (value) => {
    const raw = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (!raw)
        return '';
    if (raw.includes('rto_delivered') || raw === 'rt_dl' || raw === 'rtdl')
        return 'rto_delivered';
    if (raw.includes('rto_in_transit') || raw === 'rt_it' || raw === 'rtit')
        return 'rto_in_transit';
    if (raw.includes('delivered') && !raw.includes('rto'))
        return 'delivered';
    if (raw.includes('cancel'))
        return 'cancelled';
    if (raw.includes('lost'))
        return 'lost';
    if (raw.includes('rto'))
        return 'rto';
    return raw;
};
async function fetchLatestTrackingRows() {
    return client_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT
      latest.order_id,
      orders.order_status AS current_status,
      latest.status_code,
      latest.status_text,
      latest.tracking_at
    FROM (
      SELECT DISTINCT ON (${trackingEvents_1.tracking_events.order_id})
        ${trackingEvents_1.tracking_events.order_id} AS order_id,
        ${trackingEvents_1.tracking_events.status_code} AS status_code,
        ${trackingEvents_1.tracking_events.status_text} AS status_text,
        ${trackingEvents_1.tracking_events.created_at} AS tracking_at
      FROM ${trackingEvents_1.tracking_events}
      ORDER BY ${trackingEvents_1.tracking_events.order_id}, ${trackingEvents_1.tracking_events.created_at} DESC, ${trackingEvents_1.tracking_events.id} DESC
    ) AS latest
    INNER JOIN ${b2cOrders_1.b2c_orders} AS orders
      ON orders.id = latest.order_id
    WHERE lower(coalesce(orders.order_status, '')) NOT IN ('delivered', 'rto_delivered', 'cancelled', 'lost')
  `);
}
async function backfillOrderStatusesFromTracking() {
    console.log('Starting order status backfill from tracking history...');
    const rows = (await fetchLatestTrackingRows());
    const latestRows = (rows.rows || []);
    let updated = 0;
    let skipped = 0;
    for (const row of latestRows) {
        const normalizedStatus = normalizeTrackingStatus(row.status_code || row.status_text);
        if (!terminalStatuses.has(normalizedStatus)) {
            skipped += 1;
            continue;
        }
        const currentStatus = String(row.current_status || '').trim().toLowerCase();
        if (currentStatus === normalizedStatus) {
            skipped += 1;
            continue;
        }
        await client_1.db
            .update(b2cOrders_1.b2c_orders)
            .set({ order_status: normalizedStatus })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, row.order_id));
        updated += 1;
    }
    console.log('Order status backfill complete', {
        scanned: latestRows.length,
        updated,
        skipped,
    });
}
if (require.main === module) {
    backfillOrderStatusesFromTracking()
        .then(() => {
        process.exit(0);
    })
        .catch((error) => {
        console.error('Order status backfill failed:', error);
        process.exit(1);
    });
}
