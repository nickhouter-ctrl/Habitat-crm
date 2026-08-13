CREATE TYPE "public"."asset_source" AS ENUM('website', 'instagram', 'upload', 'generated');--> statement-breakpoint
CREATE TYPE "public"."audience_segment" AS ENUM('local_es', 'expat_nl', 'expat_en', 'expat_de');--> statement-breakpoint
CREATE TYPE "public"."competitor_segment" AS ENUM('materials', 'contractor', 'architect', 'estate_agent');--> statement-breakpoint
CREATE TYPE "public"."copy_angle" AS ENUM('material', 'price', 'showroom', 'project', 'seasonal');--> statement-breakpoint
CREATE TYPE "public"."copy_role" AS ENUM('eyebrow', 'headline', 'subline', 'cta');--> statement-breakpoint
CREATE TYPE "public"."creative_format" AS ENUM('1080x1080', '1080x1350', '1080x1920');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('draft', 'approved', 'scheduled', 'live', 'archived');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"objective" text,
	"meta_id" text,
	"effective_status" text,
	"review_feedback" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ad_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" uuid NOT NULL,
	"date" date NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"reach" integer DEFAULT 0 NOT NULL,
	"frequency" numeric(8, 4)
);
--> statement-breakpoint
ALTER TABLE "ad_metrics_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ad_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meta_id" text,
	"effective_status" text,
	"review_feedback" jsonb,
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"daily_budget_eur" numeric(14, 2),
	"lifetime_budget_eur" numeric(14, 2),
	"dayparting" jsonb,
	"targeting" jsonb,
	"locale" "language",
	"audience_segment" "audience_segment",
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_set_id" uuid NOT NULL,
	"spec_id" uuid NOT NULL,
	"name" text NOT NULL,
	"meta_id" text,
	"meta_creative_id" text,
	"image_hash" text,
	"effective_status" text,
	"review_feedback" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "asset_source" NOT NULL,
	"source_ref" text,
	"source_url" text,
	"storage_path" text NOT NULL,
	"width" integer,
	"height" integer,
	"phash" text,
	"dominant_colors" jsonb,
	"product_id" uuid,
	"tags" text[],
	"ig_metrics" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competitor_ads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competitor_id" uuid NOT NULL,
	"meta_ad_archive_id" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_start" timestamp with time zone,
	"delivery_stop" timestamp with time zone,
	"bodies" jsonb,
	"titles" jsonb,
	"languages" text[],
	"platforms" text[],
	"eu_total_reach" integer,
	"reach_breakdown" jsonb,
	"snapshot_url" text,
	"days_running" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_ads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"meta_page_id" text NOT NULL,
	"website" text,
	"segment" "competitor_segment",
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "copy_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"angle" "copy_angle" NOT NULL,
	"locale" "language" NOT NULL,
	"role" "copy_role" NOT NULL,
	"text" text NOT NULL,
	"product_id" uuid,
	"pattern" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "copy_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "creative_specs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"asset_id" uuid NOT NULL,
	"template" text NOT NULL,
	"palette" text NOT NULL,
	"format" "creative_format" NOT NULL,
	"locale" "language" NOT NULL,
	"copy" jsonb,
	"copy_angle" "copy_angle",
	"status" "creative_status" DEFAULT 'draft' NOT NULL,
	"parent_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_specs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "facet_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facet" text NOT NULL,
	"value" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spend" numeric(14, 2) DEFAULT '0' NOT NULL,
	"leads" integer DEFAULT 0 NOT NULL,
	"ad_count" integer DEFAULT 0 NOT NULL,
	"ad_days" integer DEFAULT 0 NOT NULL,
	"ctr_wilson_lower" numeric(8, 6),
	"cpl_eb_eur" numeric(14, 2),
	"meets_threshold" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facet_performance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spec_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"spec_hash" text NOT NULL,
	"rendered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "renders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "hero_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_from_eur" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "specs" jsonb;--> statement-breakpoint
ALTER TABLE "creative_specs" ADD CONSTRAINT "creative_specs_parent_id_creative_specs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."creative_specs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_meta_idx" ON "campaigns" USING btree ("meta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_metrics_daily_ad_date_idx" ON "ad_metrics_daily" USING btree ("ad_id","date");--> statement-breakpoint
CREATE INDEX "ad_sets_campaign_idx" ON "ad_sets" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ad_sets_meta_idx" ON "ad_sets" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "ads_ad_set_idx" ON "ads" USING btree ("ad_set_id");--> statement-breakpoint
CREATE INDEX "ads_spec_idx" ON "ads" USING btree ("spec_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ads_meta_idx" ON "ads" USING btree ("meta_id");--> statement-breakpoint
CREATE INDEX "assets_source_idx" ON "assets" USING btree ("source");--> statement-breakpoint
CREATE INDEX "assets_product_idx" ON "assets" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "assets_phash_idx" ON "assets" USING btree ("phash");--> statement-breakpoint
CREATE UNIQUE INDEX "competitor_ads_archive_idx" ON "competitor_ads" USING btree ("competitor_id","meta_ad_archive_id");--> statement-breakpoint
CREATE INDEX "competitor_ads_last_seen_idx" ON "competitor_ads" USING btree ("last_seen");--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_page_idx" ON "competitors" USING btree ("meta_page_id");--> statement-breakpoint
CREATE INDEX "copy_blocks_locale_role_idx" ON "copy_blocks" USING btree ("locale","role");--> statement-breakpoint
CREATE INDEX "copy_blocks_product_idx" ON "copy_blocks" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "creative_specs_status_idx" ON "creative_specs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creative_specs_product_idx" ON "creative_specs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "creative_specs_asset_idx" ON "creative_specs" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "facet_performance_facet_value_idx" ON "facet_performance" USING btree ("facet","value");--> statement-breakpoint
CREATE UNIQUE INDEX "renders_spec_hash_idx" ON "renders" USING btree ("spec_id","spec_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uidx" ON "products" USING btree ("slug") WHERE slug is not null and slug <> '';