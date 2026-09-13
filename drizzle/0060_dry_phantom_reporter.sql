CREATE TABLE "inbox_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"category" text DEFAULT 'important' NOT NULL,
	"needs_reply" boolean DEFAULT false NOT NULL,
	"summary" text NOT NULL,
	"reason" text NOT NULL,
	"deadline" text,
	"draft" text,
	"source" text DEFAULT 'rules' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ADD CONSTRAINT "inbox_suggestions_email_id_email_inbox_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email_inbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ADD CONSTRAINT "inbox_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_suggestions_email_idx" ON "inbox_suggestions" USING btree ("email_id");--> statement-breakpoint
CREATE INDEX "inbox_suggestions_status_idx" ON "inbox_suggestions" USING btree ("status");--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ENABLE ROW LEVEL SECURITY;
