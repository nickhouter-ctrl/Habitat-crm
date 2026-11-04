CREATE TABLE "worker_week_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"days" jsonb NOT NULL,
	"hourly_rate" numeric(12, 6) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'invoice' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoice" jsonb,
	"invoice_status" text,
	"invoice_key" text,
	"invoice_review_note" text,
	"purchase_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_week_status_check" CHECK ("worker_week_sheets"."status" in ('draft','submitted','returned','approved')),
	CONSTRAINT "worker_week_invoice_status_check" CHECK ("worker_week_sheets"."invoice_status" is null or "worker_week_sheets"."invoice_status" in ('submitted','returned','approved'))
);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "week_sheet_id" uuid;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "portal_invoice_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD CONSTRAINT "worker_week_sheets_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD CONSTRAINT "worker_week_sheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD CONSTRAINT "worker_week_sheets_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD CONSTRAINT "worker_week_sheets_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_week_unique_idx" ON "worker_week_sheets" USING btree ("worker_id","project_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_week_invoice_key_idx" ON "worker_week_sheets" USING btree ("invoice_key");--> statement-breakpoint
CREATE INDEX "worker_week_review_idx" ON "worker_week_sheets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "worker_week_invoice_review_idx" ON "worker_week_sheets" USING btree ("invoice_status");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_week_sheet_id_worker_week_sheets_id_fk" FOREIGN KEY ("week_sheet_id") REFERENCES "public"."worker_week_sheets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ENABLE ROW LEVEL SECURITY;
