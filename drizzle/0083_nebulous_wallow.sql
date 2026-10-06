CREATE TABLE "staff_daily_task_completions" (
	"task_id" uuid NOT NULL,
	"day" date NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_daily_task_completions_task_id_day_pk" PRIMARY KEY("task_id","day")
);
--> statement-breakpoint
CREATE TABLE "staff_daily_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_daily_tasks_kind_check" CHECK ("staff_daily_tasks"."kind" in ('mail', 'purchase_reviews'))
);
--> statement-breakpoint
ALTER TABLE "staff_daily_task_completions" ADD CONSTRAINT "staff_daily_task_completions_task_id_staff_daily_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."staff_daily_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_daily_tasks" ADD CONSTRAINT "staff_daily_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_daily_tasks_user_kind_idx" ON "staff_daily_tasks" USING btree ("user_id","kind");
--> statement-breakpoint
ALTER TABLE "staff_daily_tasks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_daily_task_completions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Explicitly assigned by Nick; other employees retain their own assigned tasks.
INSERT INTO "staff_daily_tasks" ("user_id", "kind")
SELECT u.id, task.kind FROM "users" u
CROSS JOIN (VALUES ('mail'), ('purchase_reviews')) AS task(kind)
WHERE lower(trim(u.email)) = 'nick@habitat-one.com' AND u.role = 'admin'
ON CONFLICT ("user_id", "kind") DO NOTHING;
