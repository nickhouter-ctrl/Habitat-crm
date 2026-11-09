CREATE TABLE "worker_lump_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"invoice" jsonb NOT NULL,
	"invoice_key" text NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"purchase_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_lump_invoice_status_check" CHECK ("worker_lump_invoices"."status" in ('submitted','returned','approved'))
);
--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD CONSTRAINT "worker_lump_invoices_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD CONSTRAINT "worker_lump_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD CONSTRAINT "worker_lump_invoices_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_lump_invoices" ADD CONSTRAINT "worker_lump_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_lump_invoice_key_idx" ON "worker_lump_invoices" USING btree ("invoice_key");--> statement-breakpoint
CREATE INDEX "worker_lump_invoice_project_idx" ON "worker_lump_invoices" USING btree ("project_id","status");