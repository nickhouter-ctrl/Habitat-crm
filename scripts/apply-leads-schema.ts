/**
 * Past het leads-datamodel toe (prospects, email_campaigns, campaign_recipients,
 * email_suppressions + enums). Idempotent. Nodig omdat `drizzle-kit push` op deze
 * DB crasht bij het introspecteren van een bestaande CHECK-constraint.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

async function enum_(name: string, values: string[]) {
  const vals = values.map((v) => `'${v}'`).join(", ");
  await db.execute(sql.raw(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='${name}') THEN
      CREATE TYPE ${name} AS ENUM (${vals});
    END IF;
  END $$;`));
}

(async () => {
  await enum_("prospect_category", ["architect","aannemer","makelaar","interieur","projectontwikkelaar","hovenier","overig"]);
  await enum_("prospect_status", ["new","emailed","replied","bounced","unsubscribed","converted","skipped"]);
  await enum_("prospect_source", ["google-places","import","manual"]);
  await enum_("campaign_status", ["draft","sending","sent"]);
  await enum_("campaign_send_status", ["sent","failed","suppressed"]);
  await enum_("suppression_reason", ["unsubscribed","bounced","complaint","manual"]);

  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS prospects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text NOT NULL,
    category prospect_category NOT NULL DEFAULT 'overig',
    email text,
    website text,
    phone text,
    address_line text,
    city text,
    province text,
    country text DEFAULT 'ES',
    source prospect_source NOT NULL DEFAULT 'manual',
    source_ref text,
    status prospect_status NOT NULL DEFAULT 'new',
    lawful_basis_note text,
    unsubscribe_token text NOT NULL UNIQUE,
    contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
    last_emailed_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS prospects_email_uidx ON prospects (email)`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS prospects_source_ref_uidx ON prospects (source_ref)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS prospects_status_idx ON prospects (status)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS prospects_category_idx ON prospects (category)`));

  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS email_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    subject text NOT NULL,
    intro_text text,
    product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    audience jsonb NOT NULL DEFAULT '{"categories":[]}'::jsonb,
    status campaign_status NOT NULL DEFAULT 'draft',
    sent_count integer NOT NULL DEFAULT 0,
    test_sent_at timestamptz,
    sent_at timestamptz,
    created_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON email_campaigns (status)`));

  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS campaign_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
    email text NOT NULL,
    status campaign_send_status NOT NULL DEFAULT 'sent',
    error text,
    message_id text,
    sent_at timestamptz NOT NULL DEFAULT now()
  )`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_idx ON campaign_recipients (campaign_id)`));
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_campaign_email_uidx ON campaign_recipients (campaign_id, email)`));

  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS email_suppressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    reason suppression_reason NOT NULL DEFAULT 'unsubscribed',
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`));

  // Productgroepen op campagnes (los toegevoegd na de eerste versie).
  await db.execute(sql.raw(`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS groups jsonb NOT NULL DEFAULT '[]'::jsonb`));

  console.log("Leads-schema toegepast.");
})().then(()=>process.exit(0)).catch(e=>{console.error("FOUT:", e.message); process.exit(1);});
