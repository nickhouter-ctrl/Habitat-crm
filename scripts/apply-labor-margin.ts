/**
 * Voegt de margepercentages per project toe: labor_margin_pct (uren) en
 * purchase_margin_pct (inkoop bij derden). Beide zijn marge ÷ verkoopprijs;
 * leeg = de standaard uit lib/project-financials.ts.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt over een
 * bestaande CHECK-constraint (parse-bug in drizzle-kit, niet in dit schema).
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table projects add column if not exists labor_margin_pct numeric(5, 2)`);
  await db.execute(sql`alter table projects add column if not exists purchase_margin_pct numeric(5, 2)`);
  const rows = await db.execute<{ column_name: string; data_type: string }>(sql`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'projects' and column_name in ('labor_margin_pct', 'purchase_margin_pct')
    order by column_name
  `);
  for (const r of rows) console.log(`OK: ${r.column_name} (${r.data_type})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
