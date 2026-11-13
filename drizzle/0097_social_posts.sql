CREATE TYPE "public"."social_post_kind" AS ENUM('carousel', 'single', 'howto', 'video');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('draft', 'approved', 'scheduled', 'published', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "social_asset_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"used_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_asset_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"planned_date" date NOT NULL,
	"publish_time" text DEFAULT '19:00' NOT NULL,
	"slot" integer NOT NULL,
	"theme" text NOT NULL,
	"kind" "social_post_kind" NOT NULL,
	"caption" text DEFAULT '' NOT NULL,
	"asset_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"video_source_asset_id" uuid,
	"video_asset_id" uuid,
	"video_url" text,
	"video_prompt" text,
	"video_job" jsonb,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"status" "social_post_status" DEFAULT 'draft' NOT NULL,
	"zernio_post_id" text,
	"zernio_media_urls" jsonb,
	"zernio_accounts" jsonb,
	"error" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone,
	"published_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_posts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "social_asset_usage" ADD CONSTRAINT "social_asset_usage_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_asset_usage" ADD CONSTRAINT "social_asset_usage_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_asset_usage_post_asset_idx" ON "social_asset_usage" USING btree ("post_id","asset_id");--> statement-breakpoint
CREATE INDEX "social_asset_usage_asset_idx" ON "social_asset_usage" USING btree ("asset_id","used_on");--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_planned_date_idx" ON "social_posts" USING btree ("planned_date");--> statement-breakpoint
CREATE INDEX "social_posts_week_idx" ON "social_posts" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "social_posts_status_idx" ON "social_posts" USING btree ("status");