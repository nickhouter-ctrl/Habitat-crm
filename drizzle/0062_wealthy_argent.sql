ALTER TABLE "email_inbox" ADD COLUMN "read_at" timestamp with time zone;
--> statement-breakpoint
-- Preserve the existing badge for already handled/archived messages.
UPDATE "email_inbox" SET "read_at" = COALESCE("updated_at", "received_at", now())
WHERE "status" <> 'new';
