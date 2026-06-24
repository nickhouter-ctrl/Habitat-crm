CREATE TYPE "public"."payment_method" AS ENUM('cash', 'invoice');--> statement-breakpoint
CREATE TYPE "public"."project_cost_category" AS ENUM('material', 'subcontractor', 'equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('sales', 'construction');--> statement-breakpoint
CREATE TABLE "project_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"category" "project_cost_category" DEFAULT 'material' NOT NULL,
	"description" text NOT NULL,
	"supplier" text,
	"amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'invoice' NOT NULL,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"worker_id" uuid,
	"worker_name" text,
	"date" date NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"hourly_cost_eur" numeric(8, 2) DEFAULT '0' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"paid_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"hourly_cost_eur" numeric(8, 2),
	"default_payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "phases" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "covered_phase" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" "project_kind" DEFAULT 'sales' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_price_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "budget_hours" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "project_costs" ADD CONSTRAINT "project_costs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_costs_project_idx" ON "project_costs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_costs_date_idx" ON "project_costs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "time_entries_project_idx" ON "time_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "time_entries_worker_idx" ON "time_entries" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "time_entries_date_idx" ON "time_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "workers_active_idx" ON "workers" USING btree ("active");--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_orders_project_idx" ON "purchase_orders" USING btree ("project_id");