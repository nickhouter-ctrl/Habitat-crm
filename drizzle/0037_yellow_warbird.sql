CREATE TYPE "public"."received_payment_method" AS ENUM('cash', 'bank', 'invoice', 'advance', 'other');--> statement-breakpoint
CREATE TABLE "project_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date,
	"amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"method" "received_payment_method" DEFAULT 'bank' NOT NULL,
	"description" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_payments_project_idx" ON "project_payments" USING btree ("project_id");