CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"planned_weeks" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD COLUMN "section" text;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD COLUMN "phase" text;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD COLUMN "estimated_cost_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD COLUMN "is_stelpost" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contingency_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_phases_project_idx" ON "project_phases" USING btree ("project_id");