"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillRtoEvents = backfillRtoEvents;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const rto_1 = require("../models/schema/rto");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const LEGACY_RTO_STATUSES = ['rto', 'rto_in_transit', 'rto_delivered'];
const getEventTimestamp = (row) => {
    const value = row.updated_at || row.created_at || new Date();
    return value instanceof Date ? value : new Date(value);
};
async function fetchLegacyRtoOrders() {
    return client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        user_id: b2cOrders_1.b2c_orders.user_id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        order_status: b2cOrders_1.b2c_orders.order_status,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        provider_last_status: b2cOrders_1.b2c_orders.provider_last_status,
        delivery_message: b2cOrders_1.b2c_orders.delivery_message,
        delivery_location: b2cOrders_1.b2c_orders.delivery_location,
        manifest_error: b2cOrders_1.b2c_orders.manifest_error,
        created_at: b2cOrders_1.b2c_orders.created_at,
        updated_at: b2cOrders_1.b2c_orders.updated_at,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_status} IN ('rto', 'rto_in_transit', 'rto_delivered')`, (0, drizzle_orm_1.sql) `NOT EXISTS (
          SELECT 1
          FROM ${rto_1.rto_events} existing_rto
          WHERE existing_rto.order_id = ${b2cOrders_1.b2c_orders.id}
        )`));
}
async function backfillRtoEvents() {
    console.log('Starting RTO backfill from legacy orders...');
    const legacyOrders = (await fetchLegacyRtoOrders());
    console.log(`Found ${legacyOrders.length} legacy RTO orders without event rows`);
    let inserted = 0;
    let skipped = 0;
    for (const order of legacyOrders) {
        const createdAt = getEventTimestamp(order);
        const reason = order.provider_last_status || order.manifest_error || order.delivery_message || null;
        const remarks = order.delivery_location || order.delivery_message || order.provider_last_status || null;
        try {
            await client_1.db.insert(rto_1.rto_events).values({
                order_id: order.id,
                user_id: order.user_id,
                awb_number: order.awb_number,
                status: order.order_status || 'rto',
                reason,
                remarks,
                rto_charges: null,
                payload: {
                    source: 'backfill_legacy_order',
                    order_number: order.order_number,
                    courier_partner: order.courier_partner,
                    order_status: order.order_status,
                },
                created_at: createdAt,
                updated_at: createdAt,
            });
            inserted += 1;
        }
        catch (error) {
            skipped += 1;
            console.error(`Failed to backfill RTO for order ${order.order_number}:`, error?.message || error);
        }
    }
    console.log('RTO backfill complete', {
        scanned: legacyOrders.length,
        inserted,
        skipped,
    });
}
if (require.main === module) {
    backfillRtoEvents()
        .then(() => {
        process.exit(0);
    })
        .catch((error) => {
        console.error('RTO backfill failed:', error);
        process.exit(1);
    });
}
