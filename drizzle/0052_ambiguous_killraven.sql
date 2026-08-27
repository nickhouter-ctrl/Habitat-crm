CREATE TYPE "public"."task_priority" AS ENUM('hoog', 'middel', 'laag');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "priority" "task_priority" DEFAULT 'middel' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "start_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_assignee_idx" ON "activities" USING btree ("assignee_id");