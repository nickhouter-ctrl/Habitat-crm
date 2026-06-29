ALTER TYPE "public"."contact_type" ADD VALUE 'reseller' BEFORE 'supplier';--> statement-breakpoint
CREATE TABLE "consignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"unit" text,
	"dealer_price_eur" numeric(14, 4),
	"cost_eur" numeric(14, 2),
	"qty_placed" numeric(14, 3) DEFAULT '0' NOT NULL,
	"qty_sold" numeric(14, 3) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "dealer_price_eur" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_reseller_id_contacts_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consignments_reseller_idx" ON "consignments" USING btree ("reseller_id");--> statement-breakpoint
CREATE INDEX "consignments_product_idx" ON "consignments" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "consignments_reseller_product_idx" ON "consignments" USING btree ("reseller_id","product_id");