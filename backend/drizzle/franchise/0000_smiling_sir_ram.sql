CREATE TABLE "shipray_franchise_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_number" varchar(50) NOT NULL,
	"application_id" uuid,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"geo_unit_id" uuid NOT NULL,
	"version" varchar(40) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"security_deposit_paise" bigint DEFAULT 0 NOT NULL,
	"share_bps" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" uuid,
	"suspended_at" timestamp with time zone,
	"terminated_at" timestamp with time zone,
	"terms_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_number" varchar(40) NOT NULL,
	"applicant_name" varchar(160) NOT NULL,
	"applicant_email" varchar(160) NOT NULL,
	"applicant_phone" varchar(24),
	"legal_name" varchar(180) NOT NULL,
	"trade_name" varchar(180) NOT NULL,
	"pan" varchar(20),
	"gstin" varchar(24),
	"product_id" uuid NOT NULL,
	"geo_unit_id" uuid NOT NULL,
	"organization_id" uuid,
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"kyc_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"payment_status" varchar(32) DEFAULT 'not_requested' NOT NULL,
	"agreement_status" varchar(32) DEFAULT 'not_generated' NOT NULL,
	"commercial_amount_paise" bigint DEFAULT 0 NOT NULL,
	"deposit_amount_paise" bigint DEFAULT 0 NOT NULL,
	"payment_reference" varchar(120),
	"admin_notes" text,
	"applicant_notes" text,
	"decision_reason" text,
	"reviewed_by" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"payment_verified_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_role" varchar(32) NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(48) NOT NULL,
	"entity_id" uuid,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"request_id" varchar(80),
	"ip_address" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" varchar(160) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"tier" varchar(24) NOT NULL,
	"business_type" varchar(16) DEFAULT 'all' NOT NULL,
	"courier_provider" varchar(80) DEFAULT 'all' NOT NULL,
	"mode" varchar(24) DEFAULT 'all' NOT NULL,
	"calculation_type" varchar(24) DEFAULT 'percentage' NOT NULL,
	"value_bps" integer DEFAULT 0 NOT NULL,
	"cap_bps" integer DEFAULT 3000 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"approved_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"subject" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"linked_type" varchar(32),
	"linked_id" uuid,
	"resolution" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(48) NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(24) DEFAULT 'open' NOT NULL,
	"severity" varchar(16) DEFAULT 'medium' NOT NULL,
	"owner" varchar(120),
	"linked_type" varchar(32),
	"linked_id" uuid,
	"financial_value_paise" bigint DEFAULT 0 NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_geo_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(24) NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"parent_id" uuid,
	"pincode" varchar(12),
	"state" varchar(120) NOT NULL,
	"district" varchar(120),
	"city" varchar(120),
	"mapping_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) DEFAULT 'available' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attribution_id" uuid,
	"settlement_id" uuid,
	"entry_type" varchar(32) NOT NULL,
	"state" varchar(24) NOT NULL,
	"amount_paise" bigint NOT NULL,
	"source_event_id" varchar(120) NOT NULL,
	"reversal_of_id" uuid,
	"calculation_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(32) DEFAULT 'owner' NOT NULL,
	"permissions" jsonb DEFAULT '["portal:*"]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mfa_status" varchar(24) DEFAULT 'not_enrolled' NOT NULL,
	"invited_at" timestamp with time zone,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(180) NOT NULL,
	"trade_name" varchar(180) NOT NULL,
	"pan" varchar(20),
	"gstin" varchar(24),
	"email" varchar(160) NOT NULL,
	"phone" varchar(24),
	"kyc_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"bank_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" varchar(24) DEFAULT 'created' NOT NULL,
	"provider_reference" varchar(120),
	"idempotency_key" varchar(160) NOT NULL,
	"failure_reason" text,
	"processed_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"tier" varchar(24) NOT NULL,
	"description" text,
	"price_paise" bigint DEFAULT 0 NOT NULL,
	"security_deposit_paise" bigint DEFAULT 0 NOT NULL,
	"duration_months" integer DEFAULT 12 NOT NULL,
	"default_share_bps" integer DEFAULT 0 NOT NULL,
	"agreement_version" varchar(40) DEFAULT 'v1' NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_number" varchar(50) NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_paise" bigint DEFAULT 0 NOT NULL,
	"adjustments_paise" bigint DEFAULT 0 NOT NULL,
	"hold_paise" bigint DEFAULT 0 NOT NULL,
	"withholding_paise" bigint DEFAULT 0 NOT NULL,
	"net_paise" bigint DEFAULT 0 NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_shipment_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agreement_id" uuid NOT NULL,
	"geo_unit_id" uuid NOT NULL,
	"shipment_type" varchar(16) NOT NULL,
	"shipment_id" uuid NOT NULL,
	"awb_masked" varchar(40) NOT NULL,
	"courier_provider" varchar(80) NOT NULL,
	"origin_pincode" varchar(12) NOT NULL,
	"origin_city" varchar(120),
	"origin_state" varchar(120) NOT NULL,
	"tier" varchar(24) NOT NULL,
	"order_status" varchar(40) NOT NULL,
	"attribution_status" varchar(32) DEFAULT 'provisional' NOT NULL,
	"geography_version" integer DEFAULT 1 NOT NULL,
	"rule_version" integer DEFAULT 1 NOT NULL,
	"booked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipray_franchise_territory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"geo_unit_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'reserved' NOT NULL,
	"payment_attempt_reference" varchar(120),
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipray_franchise_agreements" ADD CONSTRAINT "shipray_franchise_agreements_application_id_shipray_franchise_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."shipray_franchise_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_agreements" ADD CONSTRAINT "shipray_franchise_agreements_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_agreements" ADD CONSTRAINT "shipray_franchise_agreements_product_id_shipray_franchise_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shipray_franchise_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_agreements" ADD CONSTRAINT "shipray_franchise_agreements_geo_unit_id_shipray_franchise_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."shipray_franchise_geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_agreements" ADD CONSTRAINT "shipray_franchise_agreements_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_applications" ADD CONSTRAINT "shipray_franchise_applications_product_id_shipray_franchise_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shipray_franchise_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_applications" ADD CONSTRAINT "shipray_franchise_applications_geo_unit_id_shipray_franchise_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."shipray_franchise_geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_applications" ADD CONSTRAINT "shipray_franchise_applications_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_applications" ADD CONSTRAINT "shipray_franchise_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_audit_logs" ADD CONSTRAINT "shipray_franchise_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_commission_rules" ADD CONSTRAINT "shipray_franchise_commission_rules_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_disputes" ADD CONSTRAINT "shipray_franchise_disputes_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_disputes" ADD CONSTRAINT "shipray_franchise_disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_ledger_entries" ADD CONSTRAINT "shipray_franchise_ledger_entries_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_ledger_entries" ADD CONSTRAINT "shipray_franchise_ledger_entries_attribution_id_shipray_franchise_shipment_attributions_id_fk" FOREIGN KEY ("attribution_id") REFERENCES "public"."shipray_franchise_shipment_attributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_members" ADD CONSTRAINT "shipray_franchise_members_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_members" ADD CONSTRAINT "shipray_franchise_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_payouts" ADD CONSTRAINT "shipray_franchise_payouts_settlement_id_shipray_franchise_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."shipray_franchise_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_payouts" ADD CONSTRAINT "shipray_franchise_payouts_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_settlements" ADD CONSTRAINT "shipray_franchise_settlements_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_settlements" ADD CONSTRAINT "shipray_franchise_settlements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_shipment_attributions" ADD CONSTRAINT "shipray_franchise_shipment_attributions_organization_id_shipray_franchise_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."shipray_franchise_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_shipment_attributions" ADD CONSTRAINT "shipray_franchise_shipment_attributions_agreement_id_shipray_franchise_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."shipray_franchise_agreements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_shipment_attributions" ADD CONSTRAINT "shipray_franchise_shipment_attributions_geo_unit_id_shipray_franchise_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."shipray_franchise_geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_territory_reservations" ADD CONSTRAINT "shipray_franchise_territory_reservations_application_id_shipray_franchise_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."shipray_franchise_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_territory_reservations" ADD CONSTRAINT "shipray_franchise_territory_reservations_geo_unit_id_shipray_franchise_geo_units_id_fk" FOREIGN KEY ("geo_unit_id") REFERENCES "public"."shipray_franchise_geo_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_agreements_number_unique" ON "shipray_franchise_agreements" USING btree ("agreement_number");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_agreements_active_territory_unique" ON "shipray_franchise_agreements" USING btree ("geo_unit_id") WHERE "shipray_franchise_agreements"."status" = 'active';--> statement-breakpoint
CREATE INDEX "franchise_agreements_organization_idx" ON "shipray_franchise_agreements" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_applications_number_unique" ON "shipray_franchise_applications" USING btree ("application_number");--> statement-breakpoint
CREATE INDEX "franchise_applications_queue_idx" ON "shipray_franchise_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "franchise_applications_email_idx" ON "shipray_franchise_applications" USING btree ("applicant_email");--> statement-breakpoint
CREATE INDEX "franchise_audit_entity_idx" ON "shipray_franchise_audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_rules_code_version_unique" ON "shipray_franchise_commission_rules" USING btree ("code","version");--> statement-breakpoint
CREATE INDEX "franchise_rules_resolution_idx" ON "shipray_franchise_commission_rules" USING btree ("status","tier","business_type","courier_provider");--> statement-breakpoint
CREATE INDEX "franchise_disputes_queue_idx" ON "shipray_franchise_disputes" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "franchise_disputes_organization_idx" ON "shipray_franchise_disputes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "franchise_exceptions_queue_idx" ON "shipray_franchise_exceptions" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_geo_units_code_unique" ON "shipray_franchise_geo_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "franchise_geo_units_lookup_idx" ON "shipray_franchise_geo_units" USING btree ("type","state","district","pincode");--> statement-breakpoint
CREATE INDEX "franchise_geo_units_status_idx" ON "shipray_franchise_geo_units" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_ledger_source_event_unique" ON "shipray_franchise_ledger_entries" USING btree ("source_event_id");--> statement-breakpoint
CREATE INDEX "franchise_ledger_organization_state_idx" ON "shipray_franchise_ledger_entries" USING btree ("organization_id","state","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_members_org_user_unique" ON "shipray_franchise_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "franchise_members_user_idx" ON "shipray_franchise_members" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "franchise_organizations_email_idx" ON "shipray_franchise_organizations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "franchise_organizations_status_idx" ON "shipray_franchise_organizations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_payouts_idempotency_unique" ON "shipray_franchise_payouts" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "franchise_payouts_settlement_idx" ON "shipray_franchise_payouts" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_products_code_unique" ON "shipray_franchise_products" USING btree ("code");--> statement-breakpoint
CREATE INDEX "franchise_products_tier_status_idx" ON "shipray_franchise_products" USING btree ("tier","status");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_settlements_number_unique" ON "shipray_franchise_settlements" USING btree ("settlement_number");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_settlements_org_period_unique" ON "shipray_franchise_settlements" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_attribution_shipment_tier_unique" ON "shipray_franchise_shipment_attributions" USING btree ("shipment_type","shipment_id","tier");--> statement-breakpoint
CREATE INDEX "franchise_attribution_organization_idx" ON "shipray_franchise_shipment_attributions" USING btree ("organization_id","booked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_reservations_live_territory_unique" ON "shipray_franchise_territory_reservations" USING btree ("geo_unit_id") WHERE "shipray_franchise_territory_reservations"."status" in ('reserved', 'payment_pending');--> statement-breakpoint
CREATE INDEX "franchise_reservations_expiry_idx" ON "shipray_franchise_territory_reservations" USING btree ("status","expires_at");