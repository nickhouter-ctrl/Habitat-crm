ALTER TABLE "documents" ADD COLUMN "accept_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "requires_contract" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "signature" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "accept_record" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "unlocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "unlocked_by" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Bestaande klantlinks hebben nog geen vervaldatum. Zonder deze backfill zou de
-- expiry-check ze meteen als verlopen zien en breken de offertes die nu bij
-- klanten in de mailbox liggen. 45 dagen vanaf nu geeft iedereen ruimte.
UPDATE "documents" SET "accept_token_expires_at" = now() + interval '45 days'
  WHERE "accept_token" IS NOT NULL AND "accept_token_expires_at" IS NULL;--> statement-breakpoint
-- Al geaccepteerde/getekende offertes hoeven niet op slot: dit slot geldt vanaf
-- nu, met terugwerkende kracht sluiten zou alleen maar bestaande workflows breken.