CREATE TABLE "bulk_mail_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_reason" text,
	"warmup_started_at" timestamp with time zone,
	"daily_cap_override" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "campaign_recipients" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "queued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "company_name_snapshot" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "unsub_token" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "bounce_type" text;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD COLUMN "complained_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "daily_cap" integer;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "throttle_seconds" integer DEFAULT 6 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "send_from_hour" integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "send_to_hour" integer DEFAULT 18 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "weekdays_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "queued_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "failed_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "min_days_since_last_email" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD COLUMN "max_emails_per_prospect" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "email_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "suppress_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prospects" ADD COLUMN "last_replied_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaign_recipients_claim_idx" ON "campaign_recipients" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "campaign_recipients_sent_at_idx" ON "campaign_recipients" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "campaign_recipients_message_idx" ON "campaign_recipients" USING btree ("message_id");