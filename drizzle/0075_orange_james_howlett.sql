CREATE TABLE "partner_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"exclusive" boolean DEFAULT false NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"radius_km" numeric(8, 2),
	"territory_terms" text NOT NULL,
	"legal_reviewed" boolean DEFAULT false NOT NULL,
	"signed_path" text,
	"signed_hash" text,
	"habitat_signer" text,
	"partner_signer" text,
	"signed_on" date,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_contracts_dates_check" CHECK ("partner_contracts"."valid_until" >= "partner_contracts"."valid_from"),
	CONSTRAINT "partner_contracts_radius_check" CHECK (not "partner_contracts"."exclusive" or ("partner_contracts"."radius_km" > 0 and "partner_contracts"."latitude" between -90 and 90 and "partner_contracts"."longitude" between -180 and 180))
);
--> statement-breakpoint
CREATE TABLE "partner_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'crm' NOT NULL,
	"personal" boolean DEFAULT true NOT NULL,
	"mailbox_user" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"html" text,
	"message_id" text,
	"references_header" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"author_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_messages_status_check" CHECK ("partner_messages"."status" in ('draft','sending','sent','unknown'))
);
--> statement-breakpoint
CREATE TABLE "partner_profiles" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"interest" text DEFAULT 'unknown' NOT NULL,
	"stage" text DEFAULT 'new' NOT NULL,
	"language" text DEFAULT 'en-es' NOT NULL,
	"owner_id" uuid,
	"next_action" text,
	"next_action_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"active_contract_id" uuid,
	"public_name" text,
	"public_address" text,
	"public_city" text,
	"public_country" text,
	"public_email" text,
	"public_phone" text,
	"public_website" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_profiles_interest_check" CHECK ("partner_profiles"."interest" in ('unknown','interested','candidate','not_interested')),
	CONSTRAINT "partner_profiles_stage_check" CHECK ("partner_profiles"."stage" in ('new','contacted','discussion','proposal','active','later','stopped')),
	CONSTRAINT "partner_profiles_public_check" CHECK (not "partner_profiles"."published" or "partner_profiles"."active")
);
--> statement-breakpoint
ALTER TABLE "partner_contracts" ADD CONSTRAINT "partner_contracts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contracts" ADD CONSTRAINT "partner_contracts_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contracts" ADD CONSTRAINT "partner_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_messages" ADD CONSTRAINT "partner_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_messages" ADD CONSTRAINT "partner_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_profiles" ADD CONSTRAINT "partner_profiles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_contracts_version_idx" ON "partner_contracts" USING btree ("contact_id","version");--> statement-breakpoint
CREATE INDEX "partner_messages_contact_idx" ON "partner_messages" USING btree ("contact_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_messages_identity_idx" ON "partner_messages" USING btree ("mailbox_user","message_id");--> statement-breakpoint
ALTER TABLE "partner_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partner_messages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "partner_contracts" ENABLE ROW LEVEL SECURITY;
