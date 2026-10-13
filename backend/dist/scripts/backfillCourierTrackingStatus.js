"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillCourierTrackingStatus = backfillCourierTrackingStatus;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2bOrders_1 = require("../models/schema/b2bOrders");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const courierTracking_1 = require("../crons/courierTracking");
const STATUS_WINDOW = ['ndr', 'undelivered', 'rto', 'rto_in_transit', 'pickup_initiated', 'in_transit'];
const parseNumberArg = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};
const summarizeCurrentStatuses = async (table, label) => {
    const rows = await client_1.db
        .select({
        status: table.order_status,
        count: (0, drizzle_orm_1.sql) `count(*)::int`,
    })
        .from(table)
        .where((0, drizzle_orm_1.inArray)(table.order_status, STATUS_WINDOW))
        .groupBy(table.order_status);
    console.log(`${label}: ${JSON.stringify(rows)}`);
};
/**
 * One-time courier backfill for active shipment rows.
 * Replays the existing tracking poller in bounded rounds so stale
 * NDR/RTO/pickup states are normalized from live courier data.
 */
async function backfillCourierTrackingStatus() {
    const maxRounds = parseNumberArg(process.argv[2], 10);
    const batchSize = parseNumberArg(process.argv[3], 100);
    console.log('🔄 Starting courier tracking backfill...', { maxRounds, batchSize });
    await summarizeCurrentStatuses(b2cOrders_1.b2c_orders, 'b2c_before');
    await summarizeCurrentStatuses(b2bOrders_1.b2b_orders, 'b2b_before');
    let totalChecked = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let roundsExecuted = 0;
    for (let round = 1; round <= maxRounds; round += 1) {
        const result = await (0, courierTracking_1.pollCourierTracking)({ batchSize });
        roundsExecuted = round;
        totalChecked += result.checked;
        totalUpdated += result.updated;
        totalFailed += result.failed;
        console.log(`ℹ️ Round ${round}:`, result);
        if (result.checked === 0) {
            break;
        }
    }
    await summarizeCurrentStatuses(b2cOrders_1.b2c_orders, 'b2c_after');
    await summarizeCurrentStatuses(b2bOrders_1.b2b_orders, 'b2b_after');
    console.log('✅ Courier tracking backfill complete', {
        roundsExecuted,
        totalChecked,
        totalUpdated,
        totalFailed,
    });
}
if (require.main === module) {
    backfillCourierTrackingStatus()
        .then(() => {
        process.exit(0);
    })
        .catch((err) => {
        console.error('❌ Courier tracking backfill failed:', err);
        process.exit(1);
    });
}
