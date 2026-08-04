/**
 * Btw-tarief per ontvangst met drie decimalen.
 *
 * Nodig voor een factuur met gemengde btw: F260014 bij Finca Lisa is
 * € 28.744,61 + € 559,07 btw = 1,945%. Met twee decimalen (1,94) zit je er
 * € 1,79 naast, en dan sluit het overzicht van de klant niet meer aan.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments alter column vat_rate type numeric(6,3)`);
  const [k] = await db.execute<{ scale: number }>(sql`
    select numeric_scale as scale from information_schema.columns
    where table_name='project_payments' and column_name='vat_rate'`);
  console.log(`OK: project_payments.vat_rate met ${k.scale} decimalen`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
