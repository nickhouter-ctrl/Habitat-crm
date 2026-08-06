/**
 * Bedrag bij een verstuurde mail, zodat de lijst "Eerder opgevraagd" op het
 * project meteen laat zien om hoeveel het ging (stond alleen in de brieftekst).
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table sent_emails add column if not exists amount_eur numeric(14,2)`);
  // Bestaande voorschotbrieven: bedrag uit de eigen formulering halen
  // ("... te voldoen ter hoogte van € 50.000,00.") — die tekst maken wij zelf.
  const fix = await db.execute<{ subject: string; amount_eur: string }>(sql`
    update sent_emails
       set amount_eur = replace(replace(substring(body from 'ter hoogte van € ([0-9.,]+)'), '.', ''), ',', '.')::numeric
     where amount_eur is null
       and body ~ 'ter hoogte van € [0-9.,]+'
    returning subject, amount_eur`);
  for (const f of fix) console.log(`  €${f.amount_eur} — ${f.subject.slice(0, 60)}…`);
  console.log(`OK: sent_emails.amount_eur · ${fix.length} bestaande mail(s) aangevuld`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
