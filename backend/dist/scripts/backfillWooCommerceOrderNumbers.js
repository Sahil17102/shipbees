"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const TARGET_INTEGRATION = 'woocommerce';
const BATCH_SIZE = 250;
const trimText = (value) => String(value ?? '').trim();
const extractWooOrderNumber = (order) => {
    const internalOrderId = trimText(order?.order_id);
    const internalMatch = internalOrderId.match(/^woo_(woo_[a-f0-9]{32})_(.+)$/i);
    if (internalMatch?.[2])
        return trimText(internalMatch[2]);
    const legacyOrderNumber = trimText(order?.order_number);
    const legacyMatch = legacyOrderNumber.match(/^WC-[^-]+-(.+)$/i);
    if (legacyMatch?.[1])
        return trimText(legacyMatch[1]);
    return '';
};
async function backfillWooCommerceOrderNumbers() {
    console.log('Starting WooCommerce order number backfill...');
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let collisions = 0;
    while (true) {
        const rows = await client_1.db
            .select()
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.integration_type, TARGET_INTEGRATION), (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.order_number, 'WC-%')))
            .orderBy(b2cOrders_1.b2c_orders.created_at)
            .limit(BATCH_SIZE);
        if (!rows.length)
            break;
        scanned += rows.length;
        for (const order of rows) {
            const targetOrderNumber = extractWooOrderNumber(order);
            const currentOrderNumber = trimText(order.order_number);
            if (!targetOrderNumber || currentOrderNumber === targetOrderNumber) {
                skipped += 1;
                continue;
            }
            const [duplicate] = await client_1.db
                .select({ id: b2cOrders_1.b2c_orders.id })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, order.user_id), (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_number, targetOrderNumber), (0, drizzle_orm_1.ne)(b2cOrders_1.b2c_orders.id, order.id)))
                .limit(1);
            if (duplicate?.id) {
                collisions += 1;
                console.warn(`Skipping WooCommerce order ${order.id} because order number ${targetOrderNumber} already exists for the merchant.`);
                continue;
            }
            await client_1.db
                .update(b2cOrders_1.b2c_orders)
                .set({ order_number: targetOrderNumber, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            updated += 1;
        }
    }
    console.log('WooCommerce order number backfill complete', {
        scanned,
        updated,
        skipped,
        collisions,
    });
}
if (require.main === module) {
    backfillWooCommerceOrderNumbers()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('WooCommerce order number backfill failed:', error);
        process.exit(1);
    });
}
