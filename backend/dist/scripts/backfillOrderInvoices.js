"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillOrderInvoices = backfillOrderInvoices;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const adminOrders_service_1 = require("../models/services/adminOrders.service");
const toPositiveInt = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
const LIMIT = toPositiveInt(process.env.LIMIT, 100);
const BATCH_SIZE = Math.min(toPositiveInt(process.env.BATCH_SIZE, 25), 100);
const ORDER_TYPE = String(process.env.ORDER_TYPE || 'all').trim().toLowerCase();
const DRY_RUN = String(process.env.DRY_RUN || '').trim() === '1';
async function fetchOrderRefs(table, orderType, limit) {
    const rows = await client_1.db
        .select({
        id: table.id,
        orderNumber: table.order_number,
        createdAt: table.created_at,
    })
        .from(table)
        .where((0, drizzle_orm_1.sql) `coalesce(${table.invoice_link}, '') <> ''`)
        .orderBy((0, drizzle_orm_1.desc)(table.created_at))
        .limit(limit);
    return rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber || null,
        orderType,
    }));
}
async function backfillOrderInvoices() {
    console.log('Starting order invoice backfill...', {
        limit: LIMIT,
        batchSize: BATCH_SIZE,
        orderType: ORDER_TYPE,
        dryRun: DRY_RUN,
    });
    const scopes = ORDER_TYPE === 'b2c' ? ['b2c'] : ORDER_TYPE === 'b2b' ? ['b2b'] : ['b2c', 'b2b'];
    const perScopeLimit = Math.max(1, Math.ceil(LIMIT / scopes.length));
    const refs = [];
    if (scopes.includes('b2c')) {
        refs.push(...(await fetchOrderRefs(b2cOrders_1.b2c_orders, 'b2c', perScopeLimit)));
    }
    if (scopes.includes('b2b')) {
        refs.push(...(await fetchOrderRefs(b2bOrders_1.b2b_orders, 'b2b', perScopeLimit)));
    }
    refs.sort((a, b) => a.orderType.localeCompare(b.orderType)).splice(LIMIT);
    let regenerated = 0;
    let failed = 0;
    let skipped = 0;
    for (let index = 0; index < refs.length; index += BATCH_SIZE) {
        const batch = refs.slice(index, index + BATCH_SIZE);
        for (const order of batch) {
            if (DRY_RUN) {
                skipped += 1;
                console.log('[dry-run] would regenerate invoice', order);
                continue;
            }
            try {
                await (0, adminOrders_service_1.regenerateOrderDocumentsServiceAdmin)({
                    orderId: order.id,
                    regenerateLabel: false,
                    regenerateInvoice: true,
                });
                regenerated += 1;
                console.log('Regenerated invoice', order);
            }
            catch (error) {
                failed += 1;
                console.error('Failed to regenerate invoice', order, error?.message || error);
            }
        }
    }
    console.log('Order invoice backfill complete', {
        scanned: refs.length,
        regenerated,
        skipped,
        failed,
    });
}
if (require.main === module) {
    backfillOrderInvoices()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Order invoice backfill failed:', error);
        process.exit(1);
    });
}
