"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerCodCycles = exports.codCycles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.codCycles = (0, pg_core_1.pgTable)('cod_remittance_cycles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 80 }).notNull().unique(),
    days: (0, pg_core_1.integer)('days').notNull(),
    fee: (0, pg_core_1.numeric)('fee', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow(),
});
exports.sellerCodCycles = (0, pg_core_1.pgTable)('seller_cod_cycles', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => users_1.users.id),
    cycleId: (0, pg_core_1.uuid)('cycle_id').notNull().references(() => exports.codCycles.id),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').references(() => users_1.users.id),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).defaultNow(),
});
