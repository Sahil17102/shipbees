"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPlans = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.userPlans = (0, pg_core_1.pgTable)('user_plans', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('userId')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    plan_id: (0, pg_core_1.uuid)('plan_id').notNull(), // FK to plans.id
    business_type: (0, pg_core_1.varchar)('business_type', { length: 10 }).default('b2c').notNull(),
    assigned_at: (0, pg_core_1.timestamp)('assigned_at').defaultNow(),
    is_active: (0, pg_core_1.boolean)('is_active').default(true),
}, (table) => ({
    userBusinessTypeUnique: (0, pg_core_1.uniqueIndex)('user_plans_user_business_type_unique').on(table.userId, table.business_type),
}));
