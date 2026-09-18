ALTER TYPE "public"."campaign_send_status" ADD VALUE 'queued' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."campaign_send_status" ADD VALUE 'sending' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."campaign_send_status" ADD VALUE 'bounced';--> statement-breakpoint
ALTER TYPE "public"."campaign_send_status" ADD VALUE 'complained';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'queued' BEFORE 'sending';--> statement-breakpoint
ALTER TYPE "public"."campaign_status" ADD VALUE 'paused' BEFORE 'sent';