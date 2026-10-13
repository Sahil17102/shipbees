"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const generateCustomLabelService_1 = require("../models/services/generateCustomLabelService");
const pickupDetails_service_1 = require("../models/services/pickupDetails.service");
const trimText = (value) => String(value ?? '').trim();
async function backfillVelocityLabels() {
    const orders = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.integration_type, 'velocity'));
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const order of orders) {
        if (!(0, pickupDetails_service_1.resolveOrderAwbNumber)(order)) {
            skipped += 1;
            continue;
        }
        try {
            const labelKey = trimText(await (0, generateCustomLabelService_1.generateLabelForOrder)(order, order.user_id, client_1.db));
            if (!labelKey) {
                skipped += 1;
                continue;
            }
            await client_1.db
                .update(b2cOrders_1.b2c_orders)
                .set({ label: labelKey, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            updated += 1;
        }
        catch (error) {
            failed += 1;
            console.error(`Failed to regenerate Velocity label for ${order.order_number}:`, error?.message || error);
        }
    }
    console.log('Velocity label backfill complete', {
        scanned: orders.length,
        updated,
        skipped,
        failed,
    });
    if (failed > 0)
        process.exitCode = 1;
}
if (require.main === module) {
    backfillVelocityLabels()
        .then(() => process.exit(process.exitCode || 0))
        .catch((error) => {
        console.error('Velocity label backfill failed:', error);
        process.exit(1);
    });
}
