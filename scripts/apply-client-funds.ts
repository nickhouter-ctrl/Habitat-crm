/**
 * Kasgeld van de klant: geld dat de klant ons geeft om zíjn kosten mee te
 * betalen (ploeg, materiaal), in plaats van een aanbetaling op onze aanneemsom.
 *
 * Twee kanten, en ze moeten samen bewegen:
 *  - de ONTVANGST is geen omzet van ons;
 *  - de KOSTEN die eruit betaald worden zijn geen kosten van ons.
 * Vink je alleen het eerste aan, dan staan er kosten op het project zonder
 * opbrengst en lijkt de klus verlies te maken. Vandaar op beide een vlag, en op
 * het project een saldo van wat er nog in de pot zit.
 *
 * Let op de voorwaarde: dit klopt alleen als die inkoopfacturen ook echt van de
 * klant zijn. Staan ze op onze naam in onze administratie, dan is het onze kost
 * en is het geld onze omzet.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_payments add column if not exists client_funds boolean not null default false`);
  await db.execute(sql`alter table purchase_orders add column if not exists client_funds boolean not null default false`);
  await db.execute(sql`alter table project_costs add column if not exists client_funds boolean not null default false`);
  const rows = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.columns
    where column_name = 'client_funds' order by 1`);
  console.log("OK: client_funds op " + rows.map((r) => r.table_name).join(", "));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
