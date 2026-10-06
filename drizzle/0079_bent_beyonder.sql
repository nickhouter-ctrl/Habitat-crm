ALTER TABLE "appointments" ADD COLUMN "response_token" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "customer_status" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "customer_lang" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "customer_responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "proposed_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "customer_message" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_responseToken_unique" UNIQUE("response_token");