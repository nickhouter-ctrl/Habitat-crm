ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_status" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_error" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_lines" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "holded_push_proposed" jsonb;