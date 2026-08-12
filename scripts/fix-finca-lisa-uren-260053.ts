/**
 * Correctie op de urenregels uit inkoopfactuur Pieter Hoogendijk 260053
 * (12-08-2026). Pieter rekent € 30/uur voor werk en € 20/uur voor vervoer;
 * de verdeling bij het goedkeuren had die twee tarieven in één regel
 * gemengd. Nu per tarief een eigen regel, exact volgens de urenspecificatie:
 *
 *   Finca Lisa   3 u × € 30 (werk)  +  4 u × € 20 (vervoer)   = € 170
 *   Oliva Hotel 10 u × € 30 (werk)  +  3 u × € 20 (transport) = € 360
 *   Silvestre    6 u × € 30 en Showroom Donny 8 u × € 30 stonden al goed.
 *
 * Samen € 950 — exact de factuur ex btw. Idempotent: elke stap controleert
 * eerst of hij nog nodig is.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/fix-finca-lisa-uren-260053.ts
 */
import "./load-env";

import { and, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { timeEntries } from "../lib/db/schema";

const PO_ID = "cbd2f626-a9a1-4896-b249-637e51906f45";
const FINCA_LISA_ENTRY = "f4a80125-b523-4667-b574-4554912c48ff";
const FINCA_LISA_PROJECT = "7b06cf54-d07e-420e-aa6a-bb6e85628e0a";
const OLIVA_PROJECT = "9477a9ff-d421-4b23-a7fd-3b8a42d99c73";

async function main() {
  // Finca Lisa: hoofdregel terug naar 3 u × € 30 werk.
  const lisa = await db
    .update(timeEntries)
    .set({
      hours: "3",
      hourlyCostEur: "30",
      note: "Uren via inkoopfactuur Pieter Hoogendijk 260053 — werk",
      updatedAt: new Date(),
    })
    .where(and(eq(timeEntries.id, FINCA_LISA_ENTRY), eq(timeEntries.hourlyCostEur, "56.666667")))
    .returning({ id: timeEntries.id });
  console.log(`Finca Lisa werkregel → 3 u × € 30: ${lisa.length ? "aangepast" : "stond al goed"}`);

  // Oliva: hoofdregel terug naar 10 u × € 30 werk (was 13 u × € 27,69).
  const oliva = await db
    .update(timeEntries)
    .set({
      hours: "10",
      hourlyCostEur: "30",
      note: "Uren via inkoopfactuur Pieter Hoogendijk 260053 — werk",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(timeEntries.purchaseOrderId, PO_ID),
        eq(timeEntries.projectId, OLIVA_PROJECT),
        eq(timeEntries.hourlyCostEur, "27.692308"),
      ),
    )
    .returning({ id: timeEntries.id });
  console.log(`Oliva werkregel → 10 u × € 30: ${oliva.length ? "aangepast" : "stond al goed"}`);

  // Vervoer als eigen regels à € 20/u — alleen aanmaken als ze er nog niet staan.
  const vervoer: { projectId: string; hours: string; note: string }[] = [
    { projectId: FINCA_LISA_PROJECT, hours: "4", note: "Vervoer via inkoopfactuur Pieter Hoogendijk 260053 (03–05 aug)" },
    { projectId: OLIVA_PROJECT, hours: "3", note: "Transport Oliva via inkoopfactuur Pieter Hoogendijk 260053 (5 aug)" },
  ];
  for (const v of vervoer) {
    const bestaat = await db.query.timeEntries.findFirst({
      where: and(
        eq(timeEntries.purchaseOrderId, PO_ID),
        eq(timeEntries.projectId, v.projectId),
        eq(timeEntries.hourlyCostEur, "20"),
      ),
      columns: { id: true },
    });
    if (bestaat) {
      console.log(`vervoerregel op ${v.projectId.slice(0, 8)}…: bestond al`);
      continue;
    }
    await db.insert(timeEntries).values({
      projectId: v.projectId,
      workerName: "Pieter Hoogendijk",
      date: "2026-07-17",
      hours: v.hours,
      hourlyCostEur: "20",
      purchaseOrderId: PO_ID,
      note: v.note,
    });
    console.log(`vervoerregel op ${v.projectId.slice(0, 8)}…: ${v.hours} u × € 20 aangemaakt`);
  }

  process.exit(0);
}

main();
