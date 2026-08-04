/**
 * Btw-BEDRAG per ontvangst, naast het tarief.
 *
 * Nodig bij een factuur met gemengde tarieven: F26009 van Creadores heeft een
 * deel 21% en een deel 10%, samen € 3.147,11 over € 28.542,55. Met een
 * percentage kom je daar niet zuiver uit — het effectieve tarief is 11,0255% en
 * elke afronding daarvan kost centen. Het bedrag staat gewoon op de factuur,
 * dus dat leggen we vast.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments add column if not exists vat_amount_eur numeric(14,2)`);
  const [k] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name='project_payments' and column_name='vat_amount_eur'`);
  console.log(`OK: project_payments.vat_amount_eur (${k.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
