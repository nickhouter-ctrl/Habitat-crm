CREATE TABLE "action_item_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_item_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_name" text NOT NULL,
	"subgroup" text,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"helpers" text,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"done_at" timestamp with time zone,
	"done_by_id" uuid,
	"created_by_id" uuid,
	"archived_at" timestamp with time zone,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_items_status_check" CHECK ("action_items"."status" in ('open','in_progress','done'))
);
--> statement-breakpoint
ALTER TABLE "action_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "action_list_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_list_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_notifications" DROP CONSTRAINT "staff_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "action_item_comments" ADD CONSTRAINT "action_item_comments_item_id_action_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_item_comments" ADD CONSTRAINT "action_item_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_task_id_activities_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_list_links" ADD CONSTRAINT "action_list_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_item_comments_item_idx" ON "action_item_comments" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "action_items_open_idx" ON "action_items" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "action_items_assignee_idx" ON "action_items" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "action_list_links_token_idx" ON "action_list_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "action_list_links_user_idx" ON "action_list_links" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "staff_notifications" ADD CONSTRAINT "staff_notifications_kind_check" CHECK ("staff_notifications"."kind" in ('followup_assignment','task_assignment','appointment_assignment','team_message','daily_agenda','worker_week_submitted','action_overdue'));