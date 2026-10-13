"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xpressbeesAwbAllocations = exports.xpressbeesAwbRanges = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.xpressbeesAwbRanges = (0, pg_core_1.pgTable)('xpressbees_awb_ranges', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    startAwb: (0, pg_core_1.varchar)('start_awb', { length: 64 }).notNull(),
    endAwb: (0, pg_core_1.varchar)('end_awb', { length: 64 }).notNull(),
    nextAwb: (0, pg_core_1.varchar)('next_awb', { length: 64 }).notNull(),
    lastAllocatedAwb: (0, pg_core_1.varchar)('last_allocated_awb', { length: 64 }),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).notNull().default('active'),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdBy: (0, pg_core_1.uuid)('created_by'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    exhaustedAt: (0, pg_core_1.timestamp)('exhausted_at', { withTimezone: true }),
});
exports.xpressbeesAwbAllocations = (0, pg_core_1.pgTable)('xpressbees_awb_allocations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    rangeId: (0, pg_core_1.uuid)('range_id')
        .references(() => exports.xpressbeesAwbRanges.id)
        .notNull(),
    awbNumber: (0, pg_core_1.varchar)('awb_number', { length: 64 }).notNull().unique(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).notNull().default('reserved'),
    orderNumber: (0, pg_core_1.varchar)('order_number', { length: 100 }),
    localOrderId: (0, pg_core_1.uuid)('local_order_id'),
    userId: (0, pg_core_1.uuid)('user_id'),
    providerReference: (0, pg_core_1.varchar)('provider_reference', { length: 120 }),
    failureReason: (0, pg_core_1.text)('failure_reason'),
    providerResponse: (0, pg_core_1.jsonb)('provider_response'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
    usedAt: (0, pg_core_1.timestamp)('used_at', { withTimezone: true }),
    failedAt: (0, pg_core_1.timestamp)('failed_at', { withTimezone: true }),
});
