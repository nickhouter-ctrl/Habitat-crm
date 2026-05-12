CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'ordered', 'in_transit', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier" text NOT NULL,
	"reference" text,
	"status" "purchase_order_status" DEFAULT 'ordered' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"order_date" date,
	"expected_date" date,
	"received_at" timestamp with time zone,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"stock_applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_idx" ON "purchase_orders" USING btree ("supplier");