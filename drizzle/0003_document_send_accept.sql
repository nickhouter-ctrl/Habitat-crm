ALTER TABLE "documents" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "accept_token" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "reject_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_accept_token_idx" ON "documents" USING btree ("accept_token");