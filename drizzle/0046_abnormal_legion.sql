CREATE TYPE "public"."asset_media_type" AS ENUM('image', 'video');--> statement-breakpoint
ALTER TABLE "ads" ALTER COLUMN "spec_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ads" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "media_type" "asset_media_type" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "duration_seconds" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "thumbnail_path" text;--> statement-breakpoint
CREATE INDEX "ads_asset_idx" ON "ads" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "ads" ADD CONSTRAINT "ads_spec_xor_asset" CHECK ((spec_id is null) <> (asset_id is null));