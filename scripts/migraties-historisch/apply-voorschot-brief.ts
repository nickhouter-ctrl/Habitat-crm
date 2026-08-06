/**
 * Velden voor het voorschotverzoek: de datum van de aannemingsovereenkomst op
 * het project en een telefoonnummer per medewerker voor de ondertekening.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table projects add column if not exists contract_date date`);
  await db.execute(sql`alter table users add column if not exists phone text`);
  const rows = await db.execute<{ tabel: string; kolom: string }>(sql`
    select table_name as tabel, column_name as kolom
    from information_schema.columns
    where (table_name = 'projects' and column_name = 'contract_date')
       or (table_name = 'users' and column_name = 'phone')
    order by 1
  `);
  for (const r of rows) console.log(`OK: ${r.tabel}.${r.kolom}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
