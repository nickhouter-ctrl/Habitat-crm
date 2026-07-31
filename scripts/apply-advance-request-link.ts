/**
 * Ontvangst koppelen aan het voorschotVERZOEK waar hij bij hoort.
 *
 * Nodig omdat een klant een voorschot in delen betaalt: op een verzoek van
 * € 50.000 kan € 30.000 binnenkomen. Zonder deze koppeling telt dat wel mee in
 * de geldstroom, maar zie je nergens dat er nog € 20.000 openstaat.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments add column if not exists advance_request_id uuid references sent_emails(id) on delete set null`);
  await db.execute(sql`create index if not exists project_payments_advance_request_idx on project_payments (advance_request_id)`);
  const [k] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name = 'project_payments' and column_name = 'advance_request_id'`);
  console.log(`OK: project_payments.advance_request_id (${k.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
