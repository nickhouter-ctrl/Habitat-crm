ALTER TABLE "email_inbox" ADD COLUMN "followup_notified_at" timestamp with time zone;--> statement-breakpoint
-- Alles wat er nu al staat geldt als gemeld: bij de eerste poll-ronde na deze
-- migratie mag het team geen melding krijgen over maanden oude reacties.
UPDATE "email_inbox" SET "followup_notified_at" = now() WHERE "followup_notified_at" IS NULL;
