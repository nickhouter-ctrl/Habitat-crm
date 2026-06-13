ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "delivery_note_id" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "method" text DEFAULT 'leveren' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "delivered_at" timestamp with time zone;