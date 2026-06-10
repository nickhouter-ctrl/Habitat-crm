CREATE TYPE "public"."catalog_variant_status" AS ENUM('sample_only', 'available', 'discontinued');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_status" AS ENUM('draft', 'sent');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_unit" AS ENUM('stuk', 'doos', 'm2');--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"contact_id" uuid,
	"quote_request_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_cn" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"name_en" text NOT NULL,
	"name_cn" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_variant_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"product_size" text NOT NULL,
	"thickness_mm" text,
	"sqm_per_box" numeric(14, 3),
	"pcs_per_box" integer,
	"kg_per_box" text,
	"sale_price" numeric(14, 2),
	"supplier_price" numeric(14, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"legacy_sku" text,
	"existing_product_id" uuid,
	"color_name_en" text NOT NULL,
	"color_name_cn" text,
	"image_url" text,
	"has_sample" boolean DEFAULT false NOT NULL,
	"in_range" boolean DEFAULT false NOT NULL,
	"sale_price" numeric(14, 2),
	"supplier_price" numeric(14, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"status" "catalog_variant_status" DEFAULT 'sample_only' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"catalog_variant_id" uuid,
	"product_id" uuid,
	"size" text,
	"qty" numeric(14, 3) NOT NULL,
	"unit" "supplier_order_unit" DEFAULT 'stuk' NOT NULL,
	"sku_snapshot" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"supplier_id" uuid,
	"supplier_name" text NOT NULL,
	"supplier_email" text,
	"customer_ref" text,
	"status" "supplier_order_status" DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "kind" text DEFAULT 'quote' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "appointment_date" text;--> statement-breakpoint
ALTER TABLE "quote_requests" ADD COLUMN "appointment_time" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_quote_request_id_quote_requests_id_fk" FOREIGN KEY ("quote_request_id") REFERENCES "public"."quote_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_collection_id_catalog_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."catalog_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variant_sizes" ADD CONSTRAINT "catalog_variant_sizes_variant_id_catalog_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_product_id_catalog_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."catalog_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_variants" ADD CONSTRAINT "catalog_variants_existing_product_id_products_id_fk" FOREIGN KEY ("existing_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_order_id_supplier_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_catalog_variant_id_catalog_variants_id_fk" FOREIGN KEY ("catalog_variant_id") REFERENCES "public"."catalog_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_companies_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_starts_idx" ON "appointments" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "appointments_contact_idx" ON "appointments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "catalog_collections_sort_idx" ON "catalog_collections" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "catalog_products_collection_idx" ON "catalog_products" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "catalog_variant_sizes_variant_idx" ON "catalog_variant_sizes" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_variants_sku_idx" ON "catalog_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "catalog_variants_product_idx" ON "catalog_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_existing_product_idx" ON "catalog_variants" USING btree ("existing_product_id");--> statement-breakpoint
CREATE INDEX "catalog_variants_has_sample_idx" ON "catalog_variants" USING btree ("has_sample");--> statement-breakpoint
CREATE INDEX "catalog_variants_in_range_idx" ON "catalog_variants" USING btree ("in_range");--> statement-breakpoint
CREATE INDEX "supplier_order_items_order_idx" ON "supplier_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "supplier_orders_supplier_idx" ON "supplier_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_orders_status_idx" ON "supplier_orders" USING btree ("status");--> statement-breakpoint
ALTER TABLE "supplier_order_items" ADD CONSTRAINT "supplier_order_items_one_target" CHECK (num_nonnulls("catalog_variant_id", "product_id") = 1);