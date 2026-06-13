CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"contact_id" uuid,
	"project_id" uuid,
	"planned_date" date,
	"method" text DEFAULT 'leveren' NOT NULL,
	"status" text DEFAULT 'gepland' NOT NULL,
	"notes" text,
	"notified_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_document_idx" ON "deliveries" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliveries_planned_idx" ON "deliveries" USING btree ("planned_date");