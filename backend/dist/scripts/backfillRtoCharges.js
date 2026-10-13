"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillRtoCharges = backfillRtoCharges;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const rto_1 = require("../models/schema/rto");
const wallet_1 = require("../models/schema/wallet");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const LEGACY_RTO_STATUSES = ['rto', 'rto_in_transit', 'rto_delivered'];
const getEventTimestamp = (order) => {
    const value = order.updated_at || order.created_at || new Date();
    return value instanceof Date ? value : new Date(value);
};
async function fetchOrdersNeedingRtoBackfill() {
    return client_1.db
        .select({
        source_type: (0, drizzle_orm_1.sql) `'b2c'`,
        id: b2cOrders_1.b2c_orders.id,
        user_id: b2cOrders_1.b2c_orders.user_id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        order_status: b2cOrders_1.b2c_orders.order_status,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        integration_type: b2cOrders_1.b2c_orders.integration_type,
        courier_id: b2cOrders_1.b2c_orders.courier_id,
        pickup_details: b2cOrders_1.b2c_orders.pickup_details,
        pincode: b2cOrders_1.b2c_orders.pincode,
        weight: b2cOrders_1.b2c_orders.weight,
        length: b2cOrders_1.b2c_orders.length,
        breadth: b2cOrders_1.b2c_orders.breadth,
        height: b2cOrders_1.b2c_orders.height,
        shipping_mode: b2cOrders_1.b2c_orders.shipping_mode,
        selected_max_slab_weight: b2cOrders_1.b2c_orders.selected_max_slab_weight,
        shipping_charges: b2cOrders_1.b2c_orders.shipping_charges,
        freight_charges: b2cOrders_1.b2c_orders.freight_charges,
        delivery_message: b2cOrders_1.b2c_orders.delivery_message,
        delivery_location: b2cOrders_1.b2c_orders.delivery_location,
        provider_last_status: b2cOrders_1.b2c_orders.provider_last_status,
        manifest_error: b2cOrders_1.b2c_orders.manifest_error,
        created_at: b2cOrders_1.b2c_orders.created_at,
        updated_at: b2cOrders_1.b2c_orders.updated_at,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_status} IN ('rto', 'rto_in_transit', 'rto_delivered')`, (0, drizzle_orm_1.sql) `(
          NOT EXISTS (
            SELECT 1
            FROM ${wallet_1.walletTransactions} wt
            WHERE wt.ref = ${b2cOrders_1.b2c_orders.id}
              AND wt.type = 'debit'
              AND wt.reason ILIKE 'RTO freight%'
          )
          OR NOT EXISTS (
            SELECT 1
            FROM ${rto_1.rto_events} re
            WHERE re.order_id = ${b2cOrders_1.b2c_orders.id}
              AND re.rto_charges IS NOT NULL
              AND re.rto_charges > 0
          )
        )`));
}
async function backfillRtoCharges() {
    console.log('Starting RTO debit backfill...');
    const orders = (await fetchOrdersNeedingRtoBackfill());
    console.log(`Found ${orders.length} RTO orders that may need a debit repair`);
    let processed = 0;
    let applied = 0;
    let skipped = 0;
    for (const order of orders) {
        const eventAt = getEventTimestamp(order);
        const source = 'backfill_rto_charges';
        const reason = order.provider_last_status || order.delivery_message || order.manifest_error || null;
        const remarks = order.delivery_location || order.delivery_message || order.provider_last_status || null;
        try {
            const appliedCharge = await client_1.db.transaction(async (tx) => (0, shiprocket_service_1.recordRtoChargeAndEventOnce)(tx, order, {
                status: order.order_status || 'rto',
                reason,
                remarks,
                payload: {
                    source,
                    order_number: order.order_number,
                    courier_partner: order.courier_partner,
                    order_status: order.order_status,
                },
                eventAt,
                courierLabel: order.courier_partner || order.integration_type || 'Courier',
                source,
            }));
            processed += 1;
            if (appliedCharge && appliedCharge > 0) {
                applied += 1;
            }
            else {
                skipped += 1;
            }
        }
        catch (error) {
            skipped += 1;
            console.error(`Failed to backfill RTO charge for order ${order.order_number}:`, error?.message || error);
        }
    }
    console.log('RTO debit backfill complete', {
        scanned: orders.length,
        processed,
        applied,
        skipped,
        legacyStatuses: LEGACY_RTO_STATUSES,
    });
}
if (require.main === module) {
    backfillRtoCharges()
        .then(() => {
        process.exit(0);
    })
        .catch((error) => {
        console.error('RTO debit backfill failed:', error);
        process.exit(1);
    });
}
