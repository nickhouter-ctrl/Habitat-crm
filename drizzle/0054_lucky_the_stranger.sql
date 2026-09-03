ALTER TABLE "appointments" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_assignee_idx" ON "appointments" USING btree ("assignee_id");