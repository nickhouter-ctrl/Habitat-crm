CREATE TABLE "staff_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"contact_id" uuid,
	"task_id" uuid,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entity_id" uuid,
	"day" date,
	"actor_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_notifications_eventKey_unique" UNIQUE("event_key"),
	CONSTRAINT "staff_notifications_kind_check" CHECK ("staff_notifications"."kind" in ('followup_assignment','task_assignment','appointment_assignment','team_message','daily_agenda')),
	CONSTRAINT "staff_notifications_status_check" CHECK ("staff_notifications"."status" in ('pending','sending','sent','skipped','unknown'))
);
--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_messages" ADD CONSTRAINT "staff_messages_task_id_activities_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_messages_recipient_idx" ON "staff_messages" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "staff_messages_sender_idx" ON "staff_messages" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "staff_notifications_pending_idx" ON "staff_notifications" USING btree ("status","available_at");
--> statement-breakpoint
ALTER TABLE "staff_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_notifications" ENABLE ROW LEVEL SECURITY;
