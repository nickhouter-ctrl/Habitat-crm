ALTER TABLE "purchase_orders" ADD COLUMN "holded_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_holded_id_idx" ON "purchase_orders" USING btree ("holded_id");