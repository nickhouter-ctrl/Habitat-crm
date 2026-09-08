CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo_url" text,
	"website_url" text,
	"sku_prefix" text,
	"supplier_name" text,
	"dealer_discount_pct" numeric(6, 2),
	"trade_discount_pct" numeric(6, 2),
	"default_vat_rate" integer DEFAULT 21 NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"brand_id" uuid,
	"code" text NOT NULL,
	"sku" text,
	"barcode" text,
	"label" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_eur" numeric(14, 4),
	"list_price_eur" numeric(14, 4),
	"trade_price_eur" numeric(14, 4),
	"dealer_price_eur" numeric(14, 4),
	"discount_pct" numeric(6, 2),
	"purchase_cost_eur" numeric(14, 2),
	"cost_eur" numeric(14, 2),
	"image_url" text,
	"stock_qty" numeric(14, 3),
	"availability" "product_availability" DEFAULT 'order_only' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"specs" jsonb,
	"source_ref" text,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "option_axes" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_uidx" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_name_uidx" ON "brands" USING btree ("name");--> statement-breakpoint
CREATE INDEX "brands_active_idx" ON "brands" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_code_idx" ON "product_variants" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_brand_code_uidx" ON "product_variants" USING btree ("brand_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_uidx" ON "product_variants" USING btree ("sku") WHERE sku is not null and sku <> '';--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
-- RLS staat aan op alle publieke tabellen (zonder policies: het dicht alleen de
-- Supabase anon-API af, het CRM verbindt als postgres). Zie drizzle/README.md.
ALTER TABLE "brands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
