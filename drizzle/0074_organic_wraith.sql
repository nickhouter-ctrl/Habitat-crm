CREATE TABLE "presentation_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"mode" text NOT NULL,
	"value_eur" numeric(14, 2) NOT NULL,
	"contribution_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_eur" numeric(14, 2),
	"paid_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"minimum_order_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"remainder" text DEFAULT 'minimum' NOT NULL,
	"expires_on" date,
	"terms" text NOT NULL,
	"approved_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_agreements_mode_check" CHECK ("presentation_agreements"."mode" in ('first_order', 'spread', 'free', 'contribution')),
	CONSTRAINT "presentation_agreements_amount_check" CHECK ("presentation_agreements"."value_eur" > 0 and "presentation_agreements"."contribution_eur" >= 0 and "presentation_agreements"."contribution_eur" <= "presentation_agreements"."value_eur" and "presentation_agreements"."paid_eur" >= 0 and "presentation_agreements"."paid_eur" <= "presentation_agreements"."value_eur" - "presentation_agreements"."contribution_eur" and ("presentation_agreements"."cost_eur" is null or "presentation_agreements"."cost_eur" >= 0) and "presentation_agreements"."rate" between 0 and 100 and "presentation_agreements"."minimum_order_eur" >= 0),
	CONSTRAINT "presentation_agreements_remainder_check" CHECK ("presentation_agreements"."remainder" in ('minimum', 'carry'))
);
--> statement-breakpoint
CREATE TABLE "presentation_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"order_eur" numeric(14, 2) NOT NULL,
	"amount_eur" numeric(14, 2) NOT NULL,
	"booked_on" date NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presentation_redemptions_amount_check" CHECK ("presentation_redemptions"."amount_eur" > 0 and "presentation_redemptions"."order_eur" >= "presentation_redemptions"."amount_eur")
);
--> statement-breakpoint
ALTER TABLE "presentation_agreements" ADD CONSTRAINT "presentation_agreements_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_agreements" ADD CONSTRAINT "presentation_agreements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_redemptions" ADD CONSTRAINT "presentation_redemptions_agreement_id_presentation_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."presentation_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_redemptions" ADD CONSTRAINT "presentation_redemptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_redemptions" ADD CONSTRAINT "presentation_redemptions_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_agreements_contact_idx" ON "presentation_agreements" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "presentation_redemptions_agreement_idx" ON "presentation_redemptions" USING btree ("agreement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "presentation_redemptions_reference_idx" ON "presentation_redemptions" USING btree ("agreement_id","reference") WHERE "presentation_redemptions"."voided_at" is null;--> statement-breakpoint
ALTER TABLE "presentation_agreements" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presentation_redemptions" ENABLE ROW LEVEL SECURITY;
