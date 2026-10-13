"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualTrackingEvents = exports.manualFulfilmentLegs = exports.manualShipments = exports.manualCourierPincodes = exports.manualCouriers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const b2bOrders_1 = require("./b2bOrders");
const b2cOrders_1 = require("./b2cOrders");
const users_1 = require("./users");
exports.manualCouriers = (0, pg_core_1.pgTable)('shipray_manual_couriers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    courierId: (0, pg_core_1.integer)('courier_id').notNull(),
    code: (0, pg_core_1.varchar)('code', { length: 40 }).notNull(),
    displayName: (0, pg_core_1.varchar)('display_name', { length: 100 }).notNull(),
    supportsB2c: (0, pg_core_1.boolean)('supports_b2c').notNull().default(true),
    supportsB2b: (0, pg_core_1.boolean)('supports_b2b').notNull().default(false),
    supportsPrepaid: (0, pg_core_1.boolean)('supports_prepaid').notNull().default(true),
    supportsCod: (0, pg_core_1.boolean)('supports_cod').notNull().default(true),
    minWeightKg: (0, pg_core_1.numeric)('min_weight_kg', { precision: 10, scale: 3 })
        .$type()
        .notNull()
        .default(0.001),
    maxWeightKg: (0, pg_core_1.numeric)('max_weight_kg', { precision: 10, scale: 3 })
        .$type()
        .notNull(),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    updatedBy: (0, pg_core_1.uuid)('updated_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    courierIdUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_couriers_courier_id_unique').on(table.courierId),
    codeUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_couriers_code_unique').on(table.code),
    enabledIdx: (0, pg_core_1.index)('shipray_manual_couriers_enabled_idx').on(table.isEnabled),
}));
exports.manualCourierPincodes = (0, pg_core_1.pgTable)('shipray_manual_courier_pincodes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    manualCourierId: (0, pg_core_1.uuid)('manual_courier_id')
        .notNull()
        .references(() => exports.manualCouriers.id, { onDelete: 'cascade' }),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 6 }).notNull(),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    courierPincodeUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_courier_pincodes_unique').on(table.manualCourierId, table.pincode),
    pincodeIdx: (0, pg_core_1.index)('shipray_manual_courier_pincodes_lookup_idx').on(table.pincode, table.isEnabled),
}));
exports.manualShipments = (0, pg_core_1.pgTable)('shipray_manual_shipments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    manualCourierId: (0, pg_core_1.uuid)('manual_courier_id')
        .notNull()
        .references(() => exports.manualCouriers.id, { onDelete: 'restrict' }),
    orderType: (0, pg_core_1.varchar)('order_type', { length: 3 }).notNull(),
    b2cOrderId: (0, pg_core_1.uuid)('b2c_order_id').references(() => b2cOrders_1.b2c_orders.id, { onDelete: 'cascade' }),
    b2bOrderId: (0, pg_core_1.uuid)('b2b_order_id').references(() => b2bOrders_1.b2b_orders.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    localAwb: (0, pg_core_1.varchar)('local_awb', { length: 32 }).notNull(),
    commercialCourierName: (0, pg_core_1.varchar)('commercial_courier_name', { length: 100 }).notNull(),
    fulfilmentMode: (0, pg_core_1.varchar)('fulfilment_mode', { length: 20 }).notNull().default('unassigned'),
    operationStatus: (0, pg_core_1.varchar)('operation_status', { length: 40 }).notNull().default('booked'),
    rateCardId: (0, pg_core_1.uuid)('rate_card_id'),
    rateSnapshot: (0, pg_core_1.jsonb)('rate_snapshot'),
    bookingMeta: (0, pg_core_1.jsonb)('booking_meta'),
    cancelledAt: (0, pg_core_1.timestamp)('cancelled_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    localAwbUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_shipments_local_awb_unique').on(table.localAwb),
    b2cOrderUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_shipments_b2c_order_unique').on(table.b2cOrderId),
    b2bOrderUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_shipments_b2b_order_unique').on(table.b2bOrderId),
    queueIdx: (0, pg_core_1.index)('shipray_manual_shipments_queue_idx').on(table.operationStatus, table.createdAt),
    userIdx: (0, pg_core_1.index)('shipray_manual_shipments_user_idx').on(table.userId, table.createdAt),
}));
exports.manualFulfilmentLegs = (0, pg_core_1.pgTable)('shipray_manual_fulfilment_legs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    manualShipmentId: (0, pg_core_1.uuid)('manual_shipment_id')
        .notNull()
        .references(() => exports.manualShipments.id, { onDelete: 'cascade' }),
    attemptKey: (0, pg_core_1.varchar)('attempt_key', { length: 80 }).notNull(),
    provider: (0, pg_core_1.varchar)('provider', { length: 50 }).notNull(),
    providerCourierId: (0, pg_core_1.integer)('provider_courier_id'),
    providerCourierName: (0, pg_core_1.varchar)('provider_courier_name', { length: 100 }),
    actualAwb: (0, pg_core_1.varchar)('actual_awb', { length: 100 }),
    providerReference: (0, pg_core_1.varchar)('provider_reference', { length: 120 }),
    providerRequestId: (0, pg_core_1.varchar)('provider_request_id', { length: 120 }),
    providerLabel: (0, pg_core_1.text)('provider_label'),
    status: (0, pg_core_1.varchar)('status', { length: 40 }).notNull().default('booking'),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(false),
    requestSnapshot: (0, pg_core_1.jsonb)('request_snapshot'),
    providerResponse: (0, pg_core_1.jsonb)('provider_response'),
    errorMessage: (0, pg_core_1.text)('error_message'),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    attemptKeyUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_fulfilment_legs_attempt_key_unique').on(table.attemptKey),
    actualAwbUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_fulfilment_legs_provider_awb_unique').on(table.provider, table.actualAwb),
    shipmentIdx: (0, pg_core_1.index)('shipray_manual_fulfilment_legs_shipment_idx').on(table.manualShipmentId, table.createdAt),
}));
exports.manualTrackingEvents = (0, pg_core_1.pgTable)('shipray_manual_tracking_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    manualShipmentId: (0, pg_core_1.uuid)('manual_shipment_id')
        .notNull()
        .references(() => exports.manualShipments.id, { onDelete: 'cascade' }),
    source: (0, pg_core_1.varchar)('source', { length: 30 }).notNull().default('admin'),
    externalEventId: (0, pg_core_1.varchar)('external_event_id', { length: 160 }),
    statusCode: (0, pg_core_1.varchar)('status_code', { length: 80 }).notNull(),
    statusText: (0, pg_core_1.varchar)('status_text', { length: 200 }).notNull(),
    location: (0, pg_core_1.varchar)('location', { length: 160 }),
    remarks: (0, pg_core_1.text)('remarks'),
    raw: (0, pg_core_1.jsonb)('raw'),
    eventAt: (0, pg_core_1.timestamp)('event_at', { withTimezone: true }).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    shipmentEventIdx: (0, pg_core_1.index)('shipray_manual_tracking_events_shipment_idx').on(table.manualShipmentId, table.eventAt),
    externalEventUnique: (0, pg_core_1.uniqueIndex)('shipray_manual_tracking_events_external_unique').on(table.manualShipmentId, table.source, table.externalEventId),
}));
