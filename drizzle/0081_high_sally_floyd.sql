CREATE TABLE "project_portal_access" (
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_portal_access_project_id_contact_id_pk" PRIMARY KEY("project_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "project_portal_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_portal_access" ADD CONSTRAINT "project_portal_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_portal_access" ADD CONSTRAINT "project_portal_access_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_portal_access_contact_idx" ON "project_portal_access" USING btree ("contact_id");