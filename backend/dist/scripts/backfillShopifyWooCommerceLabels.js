"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const generateCustomLabelService_1 = require("../models/services/generateCustomLabelService");
const pickupDetails_service_1 = require("../models/services/pickupDetails.service");
const TARGET_INTEGRATIONS = ['shopify', 'woocommerce'];
const BATCH_SIZE = 100;
const trimText = (value) => String(value ?? '').trim();
const isInvalidAwbMarker = (value) => {
    const lower = trimText(value).toLowerCase();
    return (!lower ||
        lower.startsWith('status_') ||
        ['pending', 'completed', 'cancelled', 'delivered', 'failed', 'success'].includes(lower) ||
        lower.length < 6);
};
async function fetchOrdersBatch(offset) {
    return client_1.db
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(b2cOrders_1.b2c_orders.integration_type, TARGET_INTEGRATIONS), (0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.order_number}, '') <> ''`))
        .orderBy((0, drizzle_orm_1.desc)(b2cOrders_1.b2c_orders.created_at))
        .limit(BATCH_SIZE)
        .offset(offset);
}
async function backfillShopifyWooCommerceLabels() {
    console.log('Starting Shopify/WooCommerce label backfill...');
    let offset = 0;
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    let pickupUpdated = 0;
    let awbUpdated = 0;
    let labelsCleared = 0;
    while (true) {
        const rows = await fetchOrdersBatch(offset);
        if (!rows.length)
            break;
        scanned += rows.length;
        offset += rows.length;
        for (const order of rows) {
            const currentAwb = trimText(order.awb_number);
            if (currentAwb && isInvalidAwbMarker(currentAwb) && trimText(order.label)) {
                await client_1.db
                    .update(b2cOrders_1.b2c_orders)
                    .set({ label: null, updated_at: new Date() })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                labelsCleared += 1;
                skipped += 1;
                continue;
            }
            const resolvedAwbNumber = (0, pickupDetails_service_1.resolveOrderAwbNumber)(order);
            const pickupContext = await (0, pickupDetails_service_1.resolvePickupDetailsForOrder)(order.user_id, client_1.db, order);
            const updates = {};
            if (resolvedAwbNumber && trimText(order.awb_number) !== resolvedAwbNumber) {
                updates.awb_number = resolvedAwbNumber;
                awbUpdated += 1;
            }
            if (pickupContext.pickupLocationId && trimText(order.pickup_location_id) !== pickupContext.pickupLocationId) {
                updates.pickup_location_id = pickupContext.pickupLocationId;
            }
            if (pickupContext.pickupDetails) {
                const currentPickupDetails = JSON.stringify(order.pickup_details || {});
                const nextPickupDetails = JSON.stringify(pickupContext.pickupDetails);
                if (currentPickupDetails !== nextPickupDetails) {
                    updates.pickup_details = pickupContext.pickupDetails;
                    pickupUpdated += 1;
                }
            }
            if (Object.keys(updates).length > 0) {
                updates.updated_at = new Date();
                await client_1.db.update(b2cOrders_1.b2c_orders).set(updates).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            }
            const labelSourceOrder = {
                ...order,
                ...updates,
                awb_number: updates.awb_number ?? order.awb_number,
                pickup_details: updates.pickup_details ?? order.pickup_details,
                pickup_location_id: updates.pickup_location_id ?? order.pickup_location_id,
            };
            const labelAwb = (0, pickupDetails_service_1.resolveOrderAwbNumber)(labelSourceOrder);
            if (!labelAwb) {
                skipped += 1;
                continue;
            }
            try {
                const labelKey = await (0, generateCustomLabelService_1.generateLabelForOrder)(labelSourceOrder, order.user_id, client_1.db);
                const normalizedLabelKey = trimText(labelKey);
                if (!normalizedLabelKey) {
                    skipped += 1;
                    continue;
                }
                await client_1.db
                    .update(b2cOrders_1.b2c_orders)
                    .set({ label: normalizedLabelKey, updated_at: new Date() })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                updated += 1;
            }
            catch (error) {
                skipped += 1;
                console.error(`Failed to regenerate label for order ${order.order_number}:`, error?.message || error);
            }
        }
    }
    console.log('Shopify/WooCommerce label backfill complete', {
        scanned,
        updated,
        skipped,
        pickupUpdated,
        awbUpdated,
        labelsCleared,
    });
}
if (require.main === module) {
    backfillShopifyWooCommerceLabels()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Shopify/WooCommerce label backfill failed:', error);
        process.exit(1);
    });
}
