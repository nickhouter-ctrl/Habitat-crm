ALTER TABLE "worker_week_sheets" ADD COLUMN "roster" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD COLUMN "holded_sync_status" text;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD COLUMN "holded_sync_error" text;--> statement-breakpoint
ALTER TABLE "worker_week_sheets" ADD COLUMN "holded_sync_attempt_at" timestamp with time zone;