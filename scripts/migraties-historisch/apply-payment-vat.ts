/**
 * BTW-tarief per ontvangst.
 *
 * Nodig omdat "hoeveel hiervan is ex. btw" niet uit de betaalwijze af te leiden
 * is: contant heeft geen btw, een factuurbetaling volgt zijn factuur, maar een
 * voorschot kán mét of zónder btw zijn. Dat van Silvestre (€ 50.000, 07-05-2026)
 * is zonder — en werd dus € 8.677,69 te laag geteld.
 *
 * Leeg = het systeem beslist zoals voorheen. Los script omdat `drizzle-kit push`
 * op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments add column if not exists vat_rate numeric(5,2)`);
  // Het voorschot van Silvestre: geen btw (opgave Nick, 04-08-2026).
  const fix = await db.execute<{ description: string }>(sql`
    update project_payments set vat_rate = 0, updated_at = now()
     where id = 'a87ff926-0515-4d80-bea0-a3507673696d' returning description`);
  console.log(`OK: project_payments.vat_rate · ${fix.length} regel op 0% gezet`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
