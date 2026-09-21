CREATE TABLE "project_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"supplier" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_aliases" ADD CONSTRAINT "project_aliases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_aliases_project_idx" ON "project_aliases" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_aliases_label_uidx" ON "project_aliases" USING btree (lower(regexp_replace("label", '[^a-zA-Z0-9]', '', 'g')),lower(coalesce("supplier", '')));