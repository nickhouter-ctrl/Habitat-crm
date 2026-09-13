ALTER TABLE "inbox_suggestions" ADD COLUMN "draft_subject" text;--> statement-breakpoint
ALTER TABLE "inbox_suggestions" ADD COLUMN "draft_attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;