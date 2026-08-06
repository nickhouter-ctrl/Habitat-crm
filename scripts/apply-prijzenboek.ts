/**
 * Prijzenboek: eenheidsprijzen voor de offerte-calculator.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists price_book_items (
      id uuid primary key default gen_random_uuid(),
      chapter text not null,
      name text not null,
      description text,
      unit text not null default 'stuk',
      driver text not null default 'handmatig',
      factor numeric(10,3) not null default 1,
      cost_eur numeric(14,2),
      margin_pct numeric(5,2) not null default 30,
      price_eur numeric(14,2),
      product_id uuid references products(id) on delete set null,
      is_stelpost boolean not null default false,
      stelpost_note text,
      needs_review boolean not null default true,
      sort_order integer not null default 0,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create unique index if not exists price_book_chapter_name_idx on price_book_items (chapter, name)`);
  await db.execute(sql`alter table price_book_items enable row level security`);
  const [t] = await db.execute<{ n: number }>(sql`
    select count(*)::int n from information_schema.tables where table_name='price_book_items'`);
  console.log(`OK: price_book_items (${t.n})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
