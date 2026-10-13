CREATE TABLE "shipray_franchise_settlement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"status" varchar(24) DEFAULT 'included' NOT NULL,
	"hold_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipray_franchise_settlement_items" ADD CONSTRAINT "shipray_franchise_settlement_items_settlement_id_shipray_franchise_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."shipray_franchise_settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipray_franchise_settlement_items" ADD CONSTRAINT "shipray_franchise_settlement_items_ledger_entry_id_shipray_franchise_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."shipray_franchise_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "franchise_settlement_items_ledger_unique" ON "shipray_franchise_settlement_items" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE INDEX "franchise_settlement_items_settlement_idx" ON "shipray_franchise_settlement_items" USING btree ("settlement_id");