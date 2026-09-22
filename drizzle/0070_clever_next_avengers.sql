CREATE TYPE "public"."prospect_call_outcome" AS ENUM('geen-antwoord', 'terugbellen', 'interesse', 'afspraak', 'geen-interesse', 'verkeerd-nummer');--> statement-breakpoint
CREATE TABLE "prospect_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prospect_id" uuid NOT NULL,
	"called_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "prospect_call_outcome" NOT NULL,
	"note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prospect_calls" ADD CONSTRAINT "prospect_calls_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_calls" ADD CONSTRAINT "prospect_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospect_calls_prospect_idx" ON "prospect_calls" USING btree ("prospect_id","called_at");