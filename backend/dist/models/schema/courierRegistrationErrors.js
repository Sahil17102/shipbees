"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courier_registration_errors = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const pickupAddresses_1 = require("./pickupAddresses");
const users_1 = require("./users");
exports.courier_registration_errors = (0, pg_core_1.pgTable)('courier_registration_errors', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    provider: (0, pg_core_1.varchar)('provider', { length: 50 }).notNull(),
    operation: (0, pg_core_1.varchar)('operation', { length: 50 }).notNull(),
    address_id: (0, pg_core_1.uuid)('address_id').references(() => pickupAddresses_1.addresses.id, { onDelete: 'set null' }),
    pickup_address_id: (0, pg_core_1.uuid)('pickup_address_id').references(() => pickupAddresses_1.pickupAddresses.id, {
        onDelete: 'set null',
    }),
    warehouse_alias: (0, pg_core_1.varchar)('warehouse_alias', { length: 255 }),
    error_code: (0, pg_core_1.varchar)('error_code', { length: 100 }),
    error_message: (0, pg_core_1.text)('error_message').notNull(),
    error_payload: (0, pg_core_1.jsonb)('error_payload').$type(),
    request_payload: (0, pg_core_1.jsonb)('request_payload').$type(),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
