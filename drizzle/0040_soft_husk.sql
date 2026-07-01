CREATE TYPE "public"."account_request_kind" AS ENUM('particulier', 'zakelijk');--> statement-breakpoint
CREATE TYPE "public"."account_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pending', 'approved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."customer_account_status" AS ENUM('pending', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."customer_price_tier" AS ENUM('particulier', 'aannemer');--> statement-breakpoint
CREATE TYPE "public"."referral_scope" AS ENUM('business', 'particulier');--> statement-breakpoint
CREATE TABLE "account_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"kind" "account_request_kind" DEFAULT 'particulier' NOT NULL,
	"business_name" text,
	"vat_number" text,
	"address" text,
	"locale" "language",
	"message" text,
	"status" "account_request_status" DEFAULT 'pending' NOT NULL,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"document_id" uuid,
	"base_amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "commission_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid,
	"email" text NOT NULL,
	"password_hash" text,
	"price_tier" "customer_price_tier" DEFAULT 'particulier' NOT NULL,
	"status" "customer_account_status" DEFAULT 'pending' NOT NULL,
	"business_name" text,
	"vat_number" text,
	"activation_token" text,
	"activation_expires" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_contact_id" uuid NOT NULL,
	"referee_contact_id" uuid NOT NULL,
	"scope" "referral_scope" DEFAULT 'business' NOT NULL,
	"commission_pct" numeric(5, 2) DEFAULT '5' NOT NULL,
	"customer_discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_contact_id_contacts_id_fk" FOREIGN KEY ("referrer_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_contact_id_contacts_id_fk" FOREIGN KEY ("referee_contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_requests_status_idx" ON "account_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "account_requests_email_idx" ON "account_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "commission_entries_referral_idx" ON "commission_entries" USING btree ("referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_document_idx" ON "commission_entries" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_accounts_email_idx" ON "customer_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customer_accounts_contact_idx" ON "customer_accounts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "customer_accounts_status_idx" ON "customer_accounts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_pair_idx" ON "referrals" USING btree ("referrer_contact_id","referee_contact_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_idx" ON "referrals" USING btree ("referrer_contact_id");--> statement-breakpoint
CREATE INDEX "referrals_referee_idx" ON "referrals" USING btree ("referee_contact_id");