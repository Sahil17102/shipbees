"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollAmazonTracking = pollAmazonTracking;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const terminalStatuses = ['delivered', 'cancelled', 'rto_delivered', 'lost'];
async function pollAmazonTracking(batchSize = 50) {
    const pending = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.integration_type, 'amazon'), (0, drizzle_orm_1.isNotNull)(b2cOrders_1.b2c_orders.awb_number), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2cOrders_1.b2c_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2cOrders_1.b2c_orders.order_status))))
        .limit(batchSize);
    if (!pending.length) {
        return { checked: 0, updated: 0, failed: 0 };
    }
    let updated = 0;
    let failed = 0;
    for (const order of pending) {
        const awb = String(order.awb_number || '').trim();
        if (!awb)
            continue;
        try {
            await (0, shiprocket_service_1.trackByAwbService)(awb);
            updated += 1;
        }
        catch (err) {
            failed += 1;
            console.error('[AmazonShipping] Tracking poll failed', {
                order_id: order.id,
                order_number: order.order_number,
                awb,
                error: err?.message || err,
            });
        }
    }
    return { checked: pending.length, updated, failed };
}
