/**
 * Voegt projects.labor_margin_pct toe — het margepercentage op gewerkte uren
 * (marge ÷ verkoopprijs). Leeg = de standaard uit lib/project-financials.ts.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt over een
 * bestaande CHECK-constraint (parse-bug in drizzle-kit, niet in dit schema).
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table projects add column if not exists labor_margin_pct numeric(5, 2)`);
  const [check] = await db.execute<{ column_name: string; data_type: string }>(sql`
    select column_name, data_type
    from information_schema.columns
    where table_name = 'projects' and column_name = 'labor_margin_pct'
  `);
  console.log(check ? `OK: ${check.column_name} (${check.data_type})` : "kolom niet gevonden");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
