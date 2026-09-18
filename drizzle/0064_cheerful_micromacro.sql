CREATE TYPE "public"."prospect_import_status" AS ENUM('uploaded', 'analyzed', 'applying', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "prospect_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"sheet_name" text,
	"header_row" integer DEFAULT 1 NOT NULL,
	"mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_category" "prospect_category" DEFAULT 'overig' NOT NULL,
	"language" text DEFAULT 'es' NOT NULL,
	"provenance" text NOT NULL,
	"vendor" text,
	"acquired_at" timestamp with time zone,
	"vendor_ref" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"invalid_count" integer DEFAULT 0 NOT NULL,
	"skipped_contact_count" integer DEFAULT 0 NOT NULL,
	"status" "prospect_import_status" DEFAULT 'uploaded' NOT NULL,
	"error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "prospects_email_uidx";--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "contact_person_name" text;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "prospect_imports" ADD CONSTRAINT "prospect_imports_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_imports_status_idx" ON "prospect_imports" USING btree ("status");--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_import_id_prospect_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."prospect_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_email_lower_idx" ON "contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "prospects_email_lower_uidx" ON "prospects" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "prospects_city_idx" ON "prospects" USING btree ("city");--> statement-breakpoint
CREATE INDEX "prospects_import_idx" ON "prospects" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "prospects_last_emailed_idx" ON "prospects" USING btree ("last_emailed_at");