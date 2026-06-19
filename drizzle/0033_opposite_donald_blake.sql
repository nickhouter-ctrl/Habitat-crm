CREATE TABLE "sent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'reminder' NOT NULL,
	"to_email" text,
	"subject" text,
	"html" text,
	"body" text,
	"contact_id" uuid,
	"document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reminder_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "proposed_slots" jsonb;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "booking_token" text;--> statement-breakpoint
CREATE INDEX "sent_emails_contact_idx" ON "sent_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "sent_emails_created_idx" ON "sent_emails" USING btree ("created_at");