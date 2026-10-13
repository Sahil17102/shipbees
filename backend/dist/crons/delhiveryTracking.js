"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollDelhiveryTracking = pollDelhiveryTracking;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const terminalStatuses = ['delivered', 'cancelled', 'rto_delivered', 'lost'];
const normalizeBatchSize = (batchSize) => Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 50;
async function pollDelhiveryTracking(batchSize = 50) {
    const limit = normalizeBatchSize(batchSize);
    const b2cPending = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.integration_type, 'delhivery'), (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.courier_partner, '%delhivery%')), (0, drizzle_orm_1.isNotNull)(b2cOrders_1.b2c_orders.awb_number), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2cOrders_1.b2c_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2cOrders_1.b2c_orders.order_status))))
        .orderBy((0, drizzle_orm_1.asc)(b2cOrders_1.b2c_orders.updated_at))
        .limit(limit);
    const b2bPending = await client_1.db
        .select({
        id: b2bOrders_1.b2b_orders.id,
        order_number: b2bOrders_1.b2b_orders.order_number,
        awb_number: b2bOrders_1.b2b_orders.awb_number,
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.integration_type, 'delhivery'), (0, drizzle_orm_1.ilike)(b2bOrders_1.b2b_orders.courier_partner, '%delhivery%')), (0, drizzle_orm_1.isNotNull)(b2bOrders_1.b2b_orders.awb_number), (0, drizzle_orm_1.or)((0, drizzle_orm_1.notInArray)(b2bOrders_1.b2b_orders.order_status, terminalStatuses), (0, drizzle_orm_1.isNull)(b2bOrders_1.b2b_orders.order_status))))
        .orderBy((0, drizzle_orm_1.asc)(b2bOrders_1.b2b_orders.updated_at))
        .limit(limit);
    const pending = [
        ...b2cPending.map((order) => ({ ...order, source_type: 'b2c' })),
        ...b2bPending.map((order) => ({ ...order, source_type: 'b2b' })),
    ];
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
            console.error('[Delhivery] Tracking poll failed', {
                order_id: order.id,
                order_number: order.order_number,
                order_type: order.source_type,
                awb,
                error: err?.message || err,
            });
        }
    }
    return { checked: pending.length, updated, failed };
}
