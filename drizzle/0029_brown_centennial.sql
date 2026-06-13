ALTER TABLE "catalog_collections" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "catalog_variant_sizes" ADD COLUMN IF NOT EXISTS "in_stock" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "source_document_id" uuid;
