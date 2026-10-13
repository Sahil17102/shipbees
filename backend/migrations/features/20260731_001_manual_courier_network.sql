CREATE TABLE IF NOT EXISTS "shipray_manual_couriers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "courier_id" integer NOT NULL,
  "code" varchar(40) NOT NULL,
  "display_name" varchar(100) NOT NULL,
  "supports_b2c" boolean DEFAULT true NOT NULL,
  "supports_b2b" boolean DEFAULT false NOT NULL,
  "supports_prepaid" boolean DEFAULT true NOT NULL,
  "supports_cod" boolean DEFAULT true NOT NULL,
  "min_weight_kg" numeric(10,3) DEFAULT 0.001 NOT NULL,
  "max_weight_kg" numeric(10,3) NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_couriers_courier_id_unique"
  ON "shipray_manual_couriers" ("courier_id");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_couriers_code_unique"
  ON "shipray_manual_couriers" ("code");
CREATE INDEX IF NOT EXISTS "shipray_manual_couriers_enabled_idx"
  ON "shipray_manual_couriers" ("is_enabled");
DO $$ BEGIN
  ALTER TABLE "shipray_manual_couriers"
    ADD CONSTRAINT "shipray_manual_couriers_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_couriers"
    ADD CONSTRAINT "shipray_manual_couriers_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipray_manual_courier_pincodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manual_courier_id" uuid NOT NULL,
  "pincode" varchar(6) NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_courier_pincodes_unique"
  ON "shipray_manual_courier_pincodes" ("manual_courier_id", "pincode");
CREATE INDEX IF NOT EXISTS "shipray_manual_courier_pincodes_lookup_idx"
  ON "shipray_manual_courier_pincodes" ("pincode", "is_enabled");
DO $$ BEGIN
  ALTER TABLE "shipray_manual_courier_pincodes"
    ADD CONSTRAINT "shipray_manual_courier_pincodes_courier_fk"
    FOREIGN KEY ("manual_courier_id") REFERENCES "public"."shipray_manual_couriers"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipray_manual_shipments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manual_courier_id" uuid NOT NULL,
  "order_type" varchar(3) NOT NULL,
  "b2c_order_id" uuid,
  "b2b_order_id" uuid,
  "user_id" uuid NOT NULL,
  "local_awb" varchar(32) NOT NULL,
  "commercial_courier_name" varchar(100) NOT NULL,
  "fulfilment_mode" varchar(20) DEFAULT 'unassigned' NOT NULL,
  "operation_status" varchar(40) DEFAULT 'booked' NOT NULL,
  "rate_card_id" uuid,
  "rate_snapshot" jsonb,
  "booking_meta" jsonb,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shipray_manual_shipments_exactly_one_order"
    CHECK (
      ("order_type" = 'b2c' AND "b2c_order_id" IS NOT NULL AND "b2b_order_id" IS NULL)
      OR
      ("order_type" = 'b2b' AND "b2b_order_id" IS NOT NULL AND "b2c_order_id" IS NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_shipments_local_awb_unique"
  ON "shipray_manual_shipments" ("local_awb");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_shipments_b2c_order_unique"
  ON "shipray_manual_shipments" ("b2c_order_id");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_shipments_b2b_order_unique"
  ON "shipray_manual_shipments" ("b2b_order_id");
CREATE INDEX IF NOT EXISTS "shipray_manual_shipments_queue_idx"
  ON "shipray_manual_shipments" ("operation_status", "created_at");
CREATE INDEX IF NOT EXISTS "shipray_manual_shipments_user_idx"
  ON "shipray_manual_shipments" ("user_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "shipray_manual_shipments"
    ADD CONSTRAINT "shipray_manual_shipments_courier_fk"
    FOREIGN KEY ("manual_courier_id") REFERENCES "public"."shipray_manual_couriers"("id")
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_shipments"
    ADD CONSTRAINT "shipray_manual_shipments_b2c_order_fk"
    FOREIGN KEY ("b2c_order_id") REFERENCES "public"."b2c_orders"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_shipments"
    ADD CONSTRAINT "shipray_manual_shipments_b2b_order_fk"
    FOREIGN KEY ("b2b_order_id") REFERENCES "public"."b2b_orders"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_shipments"
    ADD CONSTRAINT "shipray_manual_shipments_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipray_manual_fulfilment_legs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manual_shipment_id" uuid NOT NULL,
  "attempt_key" varchar(80) NOT NULL,
  "provider" varchar(50) NOT NULL,
  "provider_courier_id" integer,
  "provider_courier_name" varchar(100),
  "actual_awb" varchar(100),
  "provider_reference" varchar(120),
  "provider_request_id" varchar(120),
  "provider_label" text,
  "status" varchar(40) DEFAULT 'booking' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "request_snapshot" jsonb,
  "provider_response" jsonb,
  "error_message" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_fulfilment_legs_attempt_key_unique"
  ON "shipray_manual_fulfilment_legs" ("attempt_key");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_fulfilment_legs_provider_awb_unique"
  ON "shipray_manual_fulfilment_legs" ("provider", "actual_awb");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_fulfilment_legs_one_active"
  ON "shipray_manual_fulfilment_legs" ("manual_shipment_id") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "shipray_manual_fulfilment_legs_shipment_idx"
  ON "shipray_manual_fulfilment_legs" ("manual_shipment_id", "created_at");
DO $$ BEGIN
  ALTER TABLE "shipray_manual_fulfilment_legs"
    ADD CONSTRAINT "shipray_manual_fulfilment_legs_shipment_fk"
    FOREIGN KEY ("manual_shipment_id") REFERENCES "public"."shipray_manual_shipments"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_fulfilment_legs"
    ADD CONSTRAINT "shipray_manual_fulfilment_legs_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "shipray_manual_tracking_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manual_shipment_id" uuid NOT NULL,
  "source" varchar(30) DEFAULT 'admin' NOT NULL,
  "external_event_id" varchar(160),
  "status_code" varchar(80) NOT NULL,
  "status_text" varchar(200) NOT NULL,
  "location" varchar(160),
  "remarks" text,
  "raw" jsonb,
  "event_at" timestamp with time zone NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "shipray_manual_tracking_events_shipment_idx"
  ON "shipray_manual_tracking_events" ("manual_shipment_id", "event_at");
CREATE UNIQUE INDEX IF NOT EXISTS "shipray_manual_tracking_events_external_unique"
  ON "shipray_manual_tracking_events" ("manual_shipment_id", "source", "external_event_id");
DO $$ BEGIN
  ALTER TABLE "shipray_manual_tracking_events"
    ADD CONSTRAINT "shipray_manual_tracking_events_shipment_fk"
    FOREIGN KEY ("manual_shipment_id") REFERENCES "public"."shipray_manual_shipments"("id")
    ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shipray_manual_tracking_events"
    ADD CONSTRAINT "shipray_manual_tracking_events_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
