ALTER TABLE "products" ADD COLUMN "collection" text;--> statement-breakpoint
CREATE INDEX "products_collection_idx" ON "products" USING btree ("collection");