/**
 * Leveranciers van vaste lasten: energie, water, telefonie, verzekering,
 * boekhouder, huur. Hun facturen horen bij géén project.
 *
 * Zonder deze lijst krijgt elke energierekening de waarschuwing "herkenbare
 * werf-/projectreferentie ontbreekt" — terecht voor een bouwfactuur, onzin voor
 * Iberdrola. De lijst wordt gevuld door het gewoon één keer aan te vinken bij
 * het goedkeuren; daarna weet het systeem het.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists overhead_suppliers (
      id uuid primary key default gen_random_uuid(),
      /** Genormaliseerde naam (kleine letters, zonder leestekens) — de sleutel. */
      supplier_key text not null unique,
      supplier_name text not null,
      tax_id text,
      note text,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`alter table overhead_suppliers enable row level security`);

  // Bekende vaste lasten alvast erin: die kosten anders allemaal één keer een
  // onterechte waarschuwing.
  const start: [string, string][] = [
    ["IBERDROLA CLIENTES, S.A.U.", "energie"],
    ["Iberdrola", "energie"],
    ["Endesa", "energie"],
    ["Naturgy", "energie"],
    ["Movistar", "telefonie/internet"],
    ["Telefónica", "telefonie/internet"],
    ["Vodafone", "telefonie/internet"],
    ["Orange", "telefonie/internet"],
  ];
  for (const [naam, soort] of start) {
    const key = naam.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^0-9a-z]/gi, "").toLowerCase();
    await db.execute(sql`
      insert into overhead_suppliers (supplier_key, supplier_name, note)
      values (${key}, ${naam}, ${soort})
      on conflict (supplier_key) do nothing`);
  }

  const rows = await db.execute<{ supplier_name: string; note: string }>(sql`
    select supplier_name, note from overhead_suppliers order by supplier_name`);
  console.log(`OK: overhead_suppliers (${rows.length})`);
  for (const r of rows) console.log(`  ${r.supplier_name} — ${r.note ?? ""}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
