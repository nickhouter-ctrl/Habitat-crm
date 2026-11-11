ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_status" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_error" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_lines" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_proposed" jsonb;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD COLUMN "holded_sync_status" text;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD COLUMN "holded_sync_error" text;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD COLUMN "holded_sync_attempt_at" timestamp with time zone;--> statement-breakpoint
-- Al goedgekeurde facturen zonder uren (o.a. Abdelmjid 24) alsnog naar Holded.
UPDATE "worker_lump_invoices" SET "holded_sync_status" = 'pending' WHERE "status" = 'approved' AND "holded_sync_status" IS NULL;
