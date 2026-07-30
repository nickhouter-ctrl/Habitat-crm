/**
 * Voorraad afboeken zonder verkoop (showroom, eigen gebruik, breuk).
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    do $$ begin
      create type stock_writeoff_reason as enum ('showroom','own_use','sample','damage','correction','other');
    exception when duplicate_object then null; end $$`);

  await db.execute(sql`
    create table if not exists stock_writeoffs (
      id uuid primary key default gen_random_uuid(),
      product_id uuid references products(id) on delete set null,
      product_name text not null,
      sku text,
      qty numeric(14,3) not null,
      reason stock_writeoff_reason not null default 'showroom',
      unit_cost_eur numeric(14,2),
      total_cost_eur numeric(14,2),
      project_id uuid references projects(id) on delete set null,
      project_cost_id uuid,
      date date not null,
      note text,
      created_by uuid references users(id) on delete set null,
      reversed_at timestamptz,
      reversed_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create index if not exists stock_writeoffs_product_idx on stock_writeoffs (product_id)`);
  await db.execute(sql`create index if not exists stock_writeoffs_date_idx on stock_writeoffs (date)`);
  await db.execute(sql`create index if not exists stock_writeoffs_project_idx on stock_writeoffs (project_id)`);
  // Net als de rest van de database: niets via de PostgREST-API. Het CRM
  // verbindt als tabel-eigenaar en gaat langs RLS heen.
  await db.execute(sql`alter table stock_writeoffs enable row level security`);

  const [t] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.tables where table_name = 'stock_writeoffs'`);
  console.log(`OK: stock_writeoffs (${t.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
