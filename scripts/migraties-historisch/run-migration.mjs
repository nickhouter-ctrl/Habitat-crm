/**
 * Draait een idempotente SQL-migratie tegen de Supabase-database.
 *
 *   DATABASE_URL=postgresql://… node scripts/run-migration.mjs <pad-naar.sql>
 *
 * Leest DATABASE_URL ook uit .env.local als die bestaat. Veilig om opnieuw te
 * draaien (de SQL is idempotent: CREATE … IF NOT EXISTS / guarded).
 */
import { readFileSync, existsSync } from "node:fs";

import postgres from "postgres";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Ontbrekend: DATABASE_URL (in .env.local of als env-variabele).");
  process.exit(1);
}
const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.error(`SQL-bestand niet gevonden: ${file ?? "(geen pad opgegeven)"}`);
  process.exit(1);
}

const sqlText = readFileSync(file, "utf-8");

async function main() {
  // `prepare:false` + max 1 — eenmalige DDL via de pooler of directe connectie.
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql.unsafe(sqlText);
    console.log("✓ Migratie toegepast.");
    // Korte verificatie.
    const [{ has_availability }] = await sql`
      select exists (
        select 1 from information_schema.columns
        where table_name = 'products' and column_name = 'availability'
      ) as has_availability`;
    const [{ catalog }] = await sql`
      select exists (
        select 1 from information_schema.tables where table_name = 'catalog_variants'
      ) as catalog`;
    const [{ orders }] = await sql`
      select exists (
        select 1 from information_schema.tables where table_name = 'supplier_orders'
      ) as orders`;
    console.log(
      `  products.availability: ${has_availability ? "ok" : "MIST"} · catalog_variants: ${catalog ? "ok" : "MIST"} · supplier_orders: ${orders ? "ok" : "MIST"}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migratie mislukt:", e.message);
  process.exit(1);
});
