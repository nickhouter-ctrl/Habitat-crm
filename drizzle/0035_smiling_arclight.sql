CREATE TYPE "public"."budget_category" AS ENUM('labor', 'material', 'subcontractor', 'equipment', 'other');--> statement-breakpoint
CREATE TABLE "project_budget_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" "budget_category" DEFAULT 'material' NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2),
	"unit_price_eur" numeric(14, 2),
	"amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_budget_lines_project_idx" ON "project_budget_lines" USING btree ("project_id");