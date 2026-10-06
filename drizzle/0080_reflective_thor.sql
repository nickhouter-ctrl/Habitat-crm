CREATE TABLE "appointment_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"contact_id" uuid NOT NULL,
	"appointment_id" uuid,
	"mode" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"message" text,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lang" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_starts_at" timestamp with time zone,
	"customer_message" text,
	"responded_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"assignee_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_responseToken_unique";--> statement-breakpoint
ALTER TABLE "appointment_invites" ADD CONSTRAINT "appointment_invites_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_invites" ADD CONSTRAINT "appointment_invites_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_invites" ADD CONSTRAINT "appointment_invites_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_invites" ADD CONSTRAINT "appointment_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_invites_contact_idx" ON "appointment_invites" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "appointment_invites_status_idx" ON "appointment_invites" USING btree ("status");--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "response_token";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "customer_status";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "customer_lang";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "customer_responded_at";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "proposed_starts_at";--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "customer_message";