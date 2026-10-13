import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { b2b_orders } from './b2bOrders'
import { b2c_orders } from './b2cOrders'
import { users } from './users'

export const manualCouriers = pgTable(
  'shipray_manual_couriers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courierId: integer('courier_id').notNull(),
    code: varchar('code', { length: 40 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    supportsB2c: boolean('supports_b2c').notNull().default(true),
    supportsB2b: boolean('supports_b2b').notNull().default(false),
    supportsPrepaid: boolean('supports_prepaid').notNull().default(true),
    supportsCod: boolean('supports_cod').notNull().default(true),
    minWeightKg: numeric('min_weight_kg', { precision: 10, scale: 3 })
      .$type<number>()
      .notNull()
      .default(0.001),
    maxWeightKg: numeric('max_weight_kg', { precision: 10, scale: 3 })
      .$type<number>()
      .notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courierIdUnique: uniqueIndex('shipray_manual_couriers_courier_id_unique').on(table.courierId),
    codeUnique: uniqueIndex('shipray_manual_couriers_code_unique').on(table.code),
    enabledIdx: index('shipray_manual_couriers_enabled_idx').on(table.isEnabled),
  }),
)

export const manualCourierPincodes = pgTable(
  'shipray_manual_courier_pincodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualCourierId: uuid('manual_courier_id')
      .notNull()
      .references(() => manualCouriers.id, { onDelete: 'cascade' }),
    pincode: varchar('pincode', { length: 6 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    courierPincodeUnique: uniqueIndex('shipray_manual_courier_pincodes_unique').on(
      table.manualCourierId,
      table.pincode,
    ),
    pincodeIdx: index('shipray_manual_courier_pincodes_lookup_idx').on(
      table.pincode,
      table.isEnabled,
    ),
  }),
)

export const manualShipments = pgTable(
  'shipray_manual_shipments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualCourierId: uuid('manual_courier_id')
      .notNull()
      .references(() => manualCouriers.id, { onDelete: 'restrict' }),
    orderType: varchar('order_type', { length: 3 }).notNull(),
    b2cOrderId: uuid('b2c_order_id').references(() => b2c_orders.id, { onDelete: 'cascade' }),
    b2bOrderId: uuid('b2b_order_id').references(() => b2b_orders.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    localAwb: varchar('local_awb', { length: 32 }).notNull(),
    commercialCourierName: varchar('commercial_courier_name', { length: 100 }).notNull(),
    fulfilmentMode: varchar('fulfilment_mode', { length: 20 }).notNull().default('unassigned'),
    operationStatus: varchar('operation_status', { length: 40 }).notNull().default('booked'),
    rateCardId: uuid('rate_card_id'),
    rateSnapshot: jsonb('rate_snapshot'),
    bookingMeta: jsonb('booking_meta'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    localAwbUnique: uniqueIndex('shipray_manual_shipments_local_awb_unique').on(table.localAwb),
    b2cOrderUnique: uniqueIndex('shipray_manual_shipments_b2c_order_unique').on(table.b2cOrderId),
    b2bOrderUnique: uniqueIndex('shipray_manual_shipments_b2b_order_unique').on(table.b2bOrderId),
    queueIdx: index('shipray_manual_shipments_queue_idx').on(
      table.operationStatus,
      table.createdAt,
    ),
    userIdx: index('shipray_manual_shipments_user_idx').on(table.userId, table.createdAt),
  }),
)

export const manualFulfilmentLegs = pgTable(
  'shipray_manual_fulfilment_legs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualShipmentId: uuid('manual_shipment_id')
      .notNull()
      .references(() => manualShipments.id, { onDelete: 'cascade' }),
    attemptKey: varchar('attempt_key', { length: 80 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    providerCourierId: integer('provider_courier_id'),
    providerCourierName: varchar('provider_courier_name', { length: 100 }),
    actualAwb: varchar('actual_awb', { length: 100 }),
    providerReference: varchar('provider_reference', { length: 120 }),
    providerRequestId: varchar('provider_request_id', { length: 120 }),
    providerLabel: text('provider_label'),
    status: varchar('status', { length: 40 }).notNull().default('booking'),
    isActive: boolean('is_active').notNull().default(false),
    requestSnapshot: jsonb('request_snapshot'),
    providerResponse: jsonb('provider_response'),
    errorMessage: text('error_message'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    attemptKeyUnique: uniqueIndex('shipray_manual_fulfilment_legs_attempt_key_unique').on(
      table.attemptKey,
    ),
    actualAwbUnique: uniqueIndex('shipray_manual_fulfilment_legs_provider_awb_unique').on(
      table.provider,
      table.actualAwb,
    ),
    shipmentIdx: index('shipray_manual_fulfilment_legs_shipment_idx').on(
      table.manualShipmentId,
      table.createdAt,
    ),
  }),
)

export const manualTrackingEvents = pgTable(
  'shipray_manual_tracking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    manualShipmentId: uuid('manual_shipment_id')
      .notNull()
      .references(() => manualShipments.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 30 }).notNull().default('admin'),
    externalEventId: varchar('external_event_id', { length: 160 }),
    statusCode: varchar('status_code', { length: 80 }).notNull(),
    statusText: varchar('status_text', { length: 200 }).notNull(),
    location: varchar('location', { length: 160 }),
    remarks: text('remarks'),
    raw: jsonb('raw'),
    eventAt: timestamp('event_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    shipmentEventIdx: index('shipray_manual_tracking_events_shipment_idx').on(
      table.manualShipmentId,
      table.eventAt,
    ),
    externalEventUnique: uniqueIndex('shipray_manual_tracking_events_external_unique').on(
      table.manualShipmentId,
      table.source,
      table.externalEventId,
    ),
  }),
)
