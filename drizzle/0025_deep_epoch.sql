ALTER TABLE "purchase_orders" ADD COLUMN "container_ref" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "shipment_ref" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "landed_cost_summary" jsonb;--> statement-breakpoint
CREATE INDEX "purchase_orders_container_ref_idx" ON "purchase_orders" USING btree ("container_ref");--> statement-breakpoint
CREATE INDEX "purchase_orders_shipment_ref_idx" ON "purchase_orders" USING btree ("shipment_ref");