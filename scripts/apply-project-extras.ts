/**
 * Meerwerk: wat er BUITEN de aanneemsom is afgesproken.
 *
 * Hoort niet bij de aanneemsom en mag dus niet van het door te belasten bedrag
 * afgetrokken worden — het komt er op de eindafrekening bovenop, als aparte
 * regels die de klant kan nalopen. Vandaar ook het veld 'akkoord': meerwerk
 * zonder akkoord van de klant is de klassieke ruzie aan het eind van een klus.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists project_extras (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references projects(id) on delete cascade,
      description text not null,
      /** Wat we de klant hiervoor rekenen, ex. btw. */
      amount_eur numeric(14,2) not null default 0,
      /** Wat het ons kost (optioneel) — voor de marge op meerwerk. */
      cost_eur numeric(14,2),
      date date not null,
      /** Akkoord van de klant: mondeling, mail, of nog niet. */
      approved_at timestamptz,
      approved_note text,
      note text,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create index if not exists project_extras_project_idx on project_extras (project_id)`);
  await db.execute(sql`alter table project_extras enable row level security`);

  // Ook een product kan meerwerk zijn: dan telt de verkoopprijs bovenop de
  // aanneemsom in plaats van erbinnen.
  await db.execute(sql`alter table project_deliveries add column if not exists is_extra boolean not null default false`);

  const [t] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.tables where table_name='project_extras'`);
  console.log(`OK: project_extras (${t.n}) + project_deliveries.is_extra`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
