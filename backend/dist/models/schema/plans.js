"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plans = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.plans = (0, pg_core_1.pgTable)('plans', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 50 }).notNull(), // e.g. Basic, Gold, Enterprise
    description: (0, pg_core_1.varchar)('description', { length: 255 }),
    business_type: (0, pg_core_1.varchar)('business_type', { length: 10 }).default('b2c').notNull(),
    is_active: (0, pg_core_1.boolean)('is_active').default(true),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
