CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"category" text,
	"subcategory" text,
	"unit" text,
	"price_eur" numeric(14, 2),
	"vat_rate" integer DEFAULT 21 NOT NULL,
	"cost_eur" numeric(14, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"description" text,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"holded_product_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_holded_id_idx" ON "products" USING btree ("holded_product_id");