ALTER TABLE "quote_requests" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_requests_dedupe_key_idx" ON "quote_requests" USING btree ("dedupe_key");