CREATE TABLE "apple_calendar_connections" (
	"id" text PRIMARY KEY DEFAULT 'team' NOT NULL,
	"owner_id" uuid NOT NULL,
	"apple_account" text NOT NULL,
	"encrypted_password" text,
	"calendar_url" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"lock_token" uuid,
	"lock_until" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apple_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" text NOT NULL,
	"appointment_id" uuid,
	"remote_url" text NOT NULL,
	"uid" text NOT NULL,
	"local_hash" text,
	"remote_hash" text,
	"remote_deleted" boolean DEFAULT false NOT NULL,
	"issue" text,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "apple_calendar_connections" ADD CONSTRAINT "apple_calendar_connections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_calendar_events" ADD CONSTRAINT "apple_calendar_events_connection_id_apple_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."apple_calendar_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apple_calendar_events" ADD CONSTRAINT "apple_calendar_events_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apple_calendar_events_remote_idx" ON "apple_calendar_events" USING btree ("connection_id","remote_url");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_calendar_events_appointment_idx" ON "apple_calendar_events" USING btree ("connection_id","appointment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_calendar_events_uid_idx" ON "apple_calendar_events" USING btree ("connection_id","uid");
--> statement-breakpoint
ALTER TABLE "apple_calendar_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apple_calendar_events" ENABLE ROW LEVEL SECURITY;
