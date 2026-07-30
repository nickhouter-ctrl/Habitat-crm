/**
 * Verstuurde mail koppelen aan een project, zodat een voorschotverzoek terug te
 * vinden is op de projectpagina (stond alleen op de klantkaart).
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table sent_emails add column if not exists project_id uuid references projects(id) on delete set null`);
  await db.execute(sql`create index if not exists sent_emails_project_idx on sent_emails (project_id)`);
  // De brief die vandaag al is verstuurd alsnog aan zijn project hangen.
  const fix = await db.execute<{ subject: string }>(sql`
    update sent_emails se
       set project_id = p.id
      from projects p
     where se.project_id is null
       and se.subject like 'Voorschot: %'
       and se.contact_id = p.contact_id
    returning se.subject`);
  console.log(`OK: sent_emails.project_id · ${fix.length} bestaande voorschotmail(s) gekoppeld`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
