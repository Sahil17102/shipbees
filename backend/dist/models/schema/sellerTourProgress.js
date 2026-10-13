"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sellerTourProgress = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.sellerTourProgress = (0, pg_core_1.pgTable)('seller_tour_progress', {
    userId: (0, pg_core_1.uuid)('user_id').primaryKey().references(() => users_1.users.id, { onDelete: 'cascade' }),
    version: (0, pg_core_1.integer)('version').notNull().default(1),
    status: (0, pg_core_1.varchar)('status', { length: 16 }).notNull().default('pending'),
    completedPages: (0, pg_core_1.jsonb)('completed_pages').$type().notNull().default([]),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
