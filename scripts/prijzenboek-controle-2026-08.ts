/**
 * Prijzenboek-controle 06-08-2026: verwerkt de uitkomst van de marktcheck
 * op de 61 seed-indicaties ("controleer"-badge).
 *
 * Wat er gebeurt (idempotent, veilig om vaker te draaien):
 *  1. "Badkamerproducten uit eigen catalogus" gaat uit — het is een
 *     placeholder zonder prijs (producten kies je via de productkiezer) en de
 *     vier eigen-collectie-posten rekenen al automatisch met catalogus-
 *     gemiddelden. Zo vervuilt hij de wizard en de "zonder prijs"-teller niet.
 *  2. Septictank vervangen: kost € 9.000 → € 7.000, marge 10% → 30%. De
 *     verkoopprijs blijft exact € 10.000; de oude kost was aan de hoge kant
 *     (fosa 4.000 L + graafwerk + aansluiting ≈ € 4.000–7.000) en 10% marge
 *     lag onder de eigen 15%-norm.
 *  3. Alle overige posten mét prijs verliezen de "controleer"-badge: getoetst
 *     aan gangbare Costa Blanca-aannemerstarieven (2026) en waar mogelijk aan
 *     eigen data (kozijnen ≈ € 391/m² inkoop uit leveranciersoffertes,
 *     sanitair uit de catalogus-sync). Posten zonder prijs houden de badge.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/prijzenboek-controle-2026-08.ts
 */
import "./load-env";

import { sql } from "drizzle-orm";

import { db } from "../lib/db";

async function main() {
  const r1 = await db.execute(sql`
    update price_book_items set active = false, needs_review = false, updated_at = now()
    where chapter = 'Badkamers & sanitair' and name = 'Badkamerproducten uit eigen catalogus' and active = true
    returning name`);
  console.log(`placeholder gedeactiveerd: ${r1.length}`);

  const r2 = await db.execute(sql`
    update price_book_items set cost_eur = 7000, margin_pct = 30, updated_at = now()
    where chapter = 'Loodgieterwerk' and name = 'Septictank vervangen' and cost_eur = 9000
    returning name, cost_eur, margin_pct, price_eur`);
  console.log(`septictank bijgesteld: ${r2.length ? JSON.stringify(r2[0]) : "al gedaan"}`);

  const r3 = await db.execute(sql`
    update price_book_items set needs_review = false, updated_at = now()
    where needs_review = true and price_eur is not null
    returning name`);
  console.log(`"controleer"-badge weg: ${r3.length} posten`);

  const rest = await db.execute<{ n: number }>(sql`select count(*)::int n from price_book_items where needs_review = true`);
  console.log(`resterend met badge: ${rest[0].n}`);
  process.exit(0);
}

main();
