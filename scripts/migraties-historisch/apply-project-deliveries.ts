/**
 * Producten die op een project geleverd worden zonder aparte verkoopfactuur.
 *
 * Nodig omdat de producten binnen de aanneemsom vallen: je factureert ze niet
 * los, maar ze moeten wél van de voorraad af, de kostprijs moet in de
 * projectkosten en de VERKOOPPRIJS moet meetellen in wat je doorbelast. Zonder
 * dit zou een geleverde bank alleen als kostenpost verschijnen en leek de marge
 * op het project te laag.
 *
 * Beide prijzen worden vastgelegd op het moment van leveren: prijswijzigingen
 * achteraf horen een afgeronde levering niet te veranderen.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists project_deliveries (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      product_id uuid references products(id) on delete set null,
      product_name text not null,
      sku text,
      qty numeric(14,3) not null,
      unit_cost_eur numeric(14,2),
      total_cost_eur numeric(14,2),
      unit_price_eur numeric(14,2),
      total_price_eur numeric(14,2),
      date date not null,
      note text,
      created_by uuid references users(id) on delete set null,
      reversed_at timestamptz,
      reversed_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create index if not exists project_deliveries_project_idx on project_deliveries (project_id)`);
  await db.execute(sql`create index if not exists project_deliveries_product_idx on project_deliveries (product_id)`);
  await db.execute(sql`alter table project_deliveries enable row level security`);
  const [t] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.tables where table_name='project_deliveries'`);
  console.log(`OK: project_deliveries (${t.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
