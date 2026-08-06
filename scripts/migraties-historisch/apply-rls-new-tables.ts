/**
 * Row Level Security aanzetten op de twee tabellen die ik nieuw heb aangemaakt.
 *
 * De andere 53 tabellen hebben het al aan; deze twee waren de uitzondering en
 * werden door de Supabase-linter terecht als fout gemeld. Zonder RLS is een
 * tabel via de PostgREST-API (de REST-laag van Supabase) benaderbaar met de
 * anon-sleutel — inkoopfacturen en voorraadmutaties horen daar niet bij.
 *
 * Geen policies: net als bij de rest is er niets dat via die API mag. Het CRM
 * zelf verbindt als rol `postgres` (de eigenaar van de tabel) en die gaat langs
 * RLS heen, dus de applicatie merkt er niets van.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table purchase_invoice_reviews enable row level security`);
  await db.execute(sql`alter table stock_writeoffs enable row level security`);

  const rows = await db.execute<{ tabel: string; rls: boolean; policies: number }>(sql`
    select c.relname as tabel, c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('purchase_invoice_reviews', 'stock_writeoffs')`);
  for (const r of rows) console.log(`OK: ${r.tabel} · RLS ${r.rls ? "aan" : "UIT"} · ${r.policies} policies`);

  const [rest] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  console.log(`Tabellen zonder RLS: ${rest.n}`);

  // Bewijs dat de applicatie er niets van merkt: gewoon kunnen lezen.
  const [check] = await db.execute<{ n: number }>(sql`select count(*)::int as n from purchase_invoice_reviews`);
  console.log(`Lezen als applicatie werkt nog: ${check.n} beoordelingen zichtbaar`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
