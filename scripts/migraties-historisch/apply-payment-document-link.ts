/**
 * Koppeling tussen een ontvangst en de factuur waar hij uit voortkomt.
 *
 * Zonder deze kolom moest de herkomst uit de omschrijving gegokt worden ("factuur
 * F260022"), en dat is precies hoe dubbeltellingen ontstaan.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments add column if not exists document_id uuid references documents(id) on delete set null`);
  // Uniek per document: één ontvangst per factuur, zodat opnieuw synchroniseren
  // nooit een tweede regel oplevert. NULL blijft toegestaan (handmatige regels).
  await db.execute(sql`create unique index if not exists project_payments_document_idx on project_payments (document_id)`);

  const [kolom] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name = 'project_payments' and column_name = 'document_id'`);
  const [idx] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from pg_indexes
    where tablename = 'project_payments' and indexname = 'project_payments_document_idx'`);
  console.log(`OK: project_payments.document_id (kolom ${kolom.n}, index ${idx.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
