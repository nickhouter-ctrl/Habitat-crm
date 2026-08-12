/**
 * Correctie op de urenregel van Finca Lisa uit inkoopfactuur Pieter
 * Hoogendijk 260053 (12-08-2026): er werd € 190 geboekt (3 u × € 63,33),
 * maar volgens de urenspecificatie hoort het € 170 te zijn — € 90 werk
 * (3 u × € 30) + € 80 vervoer. Daarmee telt de verdeling weer exact op
 * tot de € 950 ex btw van de factuur.
 *
 * Idempotent: draait alleen als de regel nog op het oude tarief staat.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/fix-finca-lisa-uren-260053.ts
 */
import "./load-env";

import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { timeEntries } from "../lib/db/schema";

async function main() {
  const rows = await db
    .update(timeEntries)
    .set({
      // 3 u blijft; € 170 ÷ 3 met zes decimalen zodat het geboekte bedrag
      // exact het factuurdeel is (zelfde afspraak als de goedkeurings-actie).
      hourlyCostEur: (170 / 3).toFixed(6),
      note: "Uren via inkoopfactuur Pieter Hoogendijk 260053 — € 90 werk + € 80 vervoer (gecorrigeerd van € 190)",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.id, "f4a80125-b523-4667-b574-4554912c48ff"),
        eq(timeEntries.hourlyCostEur, "63.333333"),
      ),
    )
    .returning({ id: timeEntries.id, hours: timeEntries.hours, rate: timeEntries.hourlyCostEur });

  console.log(rows.length ? `gecorrigeerd: ${JSON.stringify(rows[0])} → 3 u × € 56,67 = € 170,00` : "al gedaan (of regel niet gevonden)");
  process.exit(0);
}

main();
