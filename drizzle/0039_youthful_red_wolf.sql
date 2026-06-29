CREATE TYPE "public"."sample_movement_status" AS ENUM('out', 'returned', 'sold');--> statement-breakpoint
CREATE TABLE "sample_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"unit" text,
	"recipient_id" uuid,
	"recipient_name" text,
	"qty" numeric(10, 2) DEFAULT '1' NOT NULL,
	"deposit_eur" numeric(10, 2) DEFAULT '5' NOT NULL,
	"status" "sample_movement_status" DEFAULT 'out' NOT NULL,
	"date" date NOT NULL,
	"document_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sample_stock_qty" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sample_movements" ADD CONSTRAINT "sample_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_movements" ADD CONSTRAINT "sample_movements_recipient_id_contacts_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sample_movements_product_idx" ON "sample_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sample_movements_recipient_idx" ON "sample_movements" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "sample_movements_status_idx" ON "sample_movements" USING btree ("status");