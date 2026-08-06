-- Inhaal-migratie (2026-08-06): brengt de migratieketen weer gelijk met de
-- werkelijke database. Alles hierin bestaat al in productie (aangemaakt via
-- losse scripts/apply-*.ts); daarom is elk statement idempotent geschreven.
-- Op een verse database maakt deze migratie de objecten echt aan.
DO $$ BEGIN
 CREATE TYPE "public"."campaign_send_status" AS ENUM('sent', 'failed', 'suppressed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'sending', 'sent');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."prospect_category" AS ENUM('architect', 'aannemer', 'makelaar', 'interieur', 'projectontwikkelaar', 'hovenier', 'overig');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."prospect_source" AS ENUM('google-places', 'import', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."prospect_status" AS ENUM('new', 'emailed', 'replied', 'bounced', 'unsubscribed', 'converted', 'skipped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."stock_writeoff_reason" AS ENUM('showroom', 'own_use', 'sample', 'damage', 'correction', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribed', 'bounced', 'complaint', 'manual');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."document_kind" ADD VALUE IF NOT EXISTS 'fondos';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"prospect_id" uuid,
	"email" text NOT NULL,
	"status" "campaign_send_status" DEFAULT 'sent' NOT NULL,
	"error" text,
	"message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"intro_text" text,
	"language" text DEFAULT 'es' NOT NULL,
	"groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience" jsonb DEFAULT '{"categories":[]}'::jsonb NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"test_sent_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"reason" "suppression_reason" DEFAULT 'unsubscribed' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_suppressions_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kv_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"purpose" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "overhead_suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_key" text NOT NULL,
	"supplier_name" text NOT NULL,
	"tax_id" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "overhead_suppliers_supplierKey_unique" UNIQUE("supplier_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_book_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit" text DEFAULT 'stuk' NOT NULL,
	"driver" text DEFAULT 'handmatig' NOT NULL,
	"factor" numeric(10, 3) DEFAULT '1' NOT NULL,
	"cost_eur" numeric(14, 2),
	"margin_pct" numeric(5, 2) DEFAULT '30' NOT NULL,
	"price_eur" numeric(14, 2),
	"product_id" uuid,
	"is_stelpost" boolean DEFAULT false NOT NULL,
	"stelpost_note" text,
	"needs_review" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"qty" numeric(14, 3) NOT NULL,
	"unit_cost_eur" numeric(14, 2),
	"total_cost_eur" numeric(14, 2),
	"unit_price_eur" numeric(14, 2),
	"total_price_eur" numeric(14, 2),
	"date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"is_extra" boolean DEFAULT false NOT NULL,
	"to_order_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount_eur" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cost_eur" numeric(14, 2),
	"date" date NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_note" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prospects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"category" "prospect_category" DEFAULT 'overig' NOT NULL,
	"email" text,
	"website" text,
	"phone" text,
	"address_line" text,
	"city" text,
	"province" text,
	"country" text DEFAULT 'ES',
	"source" "prospect_source" DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"status" "prospect_status" DEFAULT 'new' NOT NULL,
	"lawful_basis_note" text,
	"unsubscribe_token" text NOT NULL,
	"contact_id" uuid,
	"last_emailed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prospects_unsubscribeToken_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_invoice_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"mail_attachment_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"proposed_supplier" text,
	"proposed_reference" text,
	"proposed_total" numeric(14, 2),
	"proposed_subtotal" numeric(14, 2),
	"proposed_currency" text,
	"proposed_total_original" numeric(14, 2),
	"fx_rate" numeric(14, 6),
	"proposed_invoice_date" date,
	"suggested_project_id" uuid,
	"suggested_kind" text,
	"suggested_hours" numeric(8, 2),
	"ai_fields" jsonb,
	"ai_read_ok" boolean,
	"ai_error" text,
	"ai_model" text,
	"ai_prompt_version" integer,
	"ai_checked_at" timestamp with time zone,
	"ai_attempts" integer DEFAULT 0 NOT NULL,
	"verdict" text DEFAULT 'pending' NOT NULL,
	"findings" jsonb,
	"duplicate_of_po_id" uuid,
	"supplier_email" text,
	"supplier_email_source" text,
	"purchase_order_id" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decided_via" text,
	"decision_note" text,
	"reject_message_id" text,
	"notified_at" timestamp with time zone,
	"action_token" text,
	"action_token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_invoice_reviews_actionToken_unique" UNIQUE("action_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_writeoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"sku" text,
	"qty" numeric(14, 3) NOT NULL,
	"reason" "stock_writeoff_reason" DEFAULT 'showroom' NOT NULL,
	"unit_cost_eur" numeric(14, 2),
	"total_cost_eur" numeric(14, 2),
	"project_id" uuid,
	"project_cost_id" uuid,
	"date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "hourly_cost_eur" SET DATA TYPE numeric(12, 6);
--> statement-breakpoint
ALTER TABLE "time_entries" ALTER COLUMN "hourly_cost_eur" SET DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "workers" ALTER COLUMN "hourly_cost_eur" SET DATA TYPE numeric(12, 6);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "tax_id" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "payment_schedule" jsonb;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "attachments" jsonb;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_advance" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "vat_reverse_charge" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "advance_settled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "is_external" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_inbox" ADD COLUMN IF NOT EXISTS "references_header" text;
--> statement-breakpoint
ALTER TABLE "project_costs" ADD COLUMN IF NOT EXISTS "purchase_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "document_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "advance_request_id" uuid;
--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "vat_rate" numeric(6, 3);
--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN IF NOT EXISTS "vat_amount_eur" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "contract_date" date;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "labor_margin_pct" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "purchase_margin_pct" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "site_alias" text;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'order' NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "count_as_labor" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "suggested_project_id" uuid;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "suggested_kind" text;
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "suggested_hours" numeric(8, 2);
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN IF NOT EXISTS "amount_eur" numeric(14, 2);
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "purchase_order_id" uuid;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "self_logged_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "portal_lang" text DEFAULT 'es' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_prospect_id_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."prospects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "overhead_suppliers" ADD CONSTRAINT "overhead_suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_book_items" ADD CONSTRAINT "price_book_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_deliveries" ADD CONSTRAINT "project_deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_deliveries" ADD CONSTRAINT "project_deliveries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_deliveries" ADD CONSTRAINT "project_deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_deliveries" ADD CONSTRAINT "project_deliveries_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_extras" ADD CONSTRAINT "project_extras_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_extras" ADD CONSTRAINT "project_extras_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prospects" ADD CONSTRAINT "prospects_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_email_id_email_inbox_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."email_inbox"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_mail_attachment_id_mail_attachments_id_fk" FOREIGN KEY ("mail_attachment_id") REFERENCES "public"."mail_attachments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_suggested_project_id_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_duplicate_of_po_id_purchase_orders_id_fk" FOREIGN KEY ("duplicate_of_po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_reviews" ADD CONSTRAINT "purchase_invoice_reviews_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_writeoffs" ADD CONSTRAINT "stock_writeoffs_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_portal_links" ADD CONSTRAINT "worker_portal_links_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "worker_portal_links" ADD CONSTRAINT "worker_portal_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_recipients_campaign_idx" ON "campaign_recipients" USING btree ("campaign_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_recipients_campaign_email_uidx" ON "campaign_recipients" USING btree ("campaign_id","email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_campaigns_status_idx" ON "email_campaigns" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_tokens_user_idx" ON "login_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_book_chapter_name_idx" ON "price_book_items" USING btree ("chapter","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_deliveries_project_idx" ON "project_deliveries" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_deliveries_product_idx" ON "project_deliveries" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_extras_project_idx" ON "project_extras" USING btree ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_email_uidx" ON "prospects" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_source_ref_uidx" ON "prospects" USING btree ("source_ref");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospects_status_idx" ON "prospects" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prospects_category_idx" ON "prospects" USING btree ("category");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_invoice_reviews_attachment_idx" ON "purchase_invoice_reviews" USING btree ("mail_attachment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_reviews_status_idx" ON "purchase_invoice_reviews" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_reviews_email_idx" ON "purchase_invoice_reviews" USING btree ("email_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_reviews_reference_idx" ON "purchase_invoice_reviews" USING btree ("proposed_reference");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_writeoffs_product_idx" ON "stock_writeoffs" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_writeoffs_date_idx" ON "stock_writeoffs" USING btree ("date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_writeoffs_project_idx" ON "stock_writeoffs" USING btree ("project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_portal_links_token_idx" ON "worker_portal_links" USING btree ("token");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_portal_links_worker_project_idx" ON "worker_portal_links" USING btree ("worker_id","project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_portal_links_project_idx" ON "worker_portal_links" USING btree ("project_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_costs" ADD CONSTRAINT "project_costs_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_advance_request_id_sent_emails_id_fk" FOREIGN KEY ("advance_request_id") REFERENCES "public"."sent_emails"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_suggested_project_id_projects_id_fk" FOREIGN KEY ("suggested_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_payments_document_idx" ON "project_payments" USING btree ("document_id");
