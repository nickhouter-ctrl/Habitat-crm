/**
 * Vervangend voorschotdocument voor FAC-2026-0028 (Jochen & Manon Brouwers,
 * project Silvestre) volgens de procedure van de boekhouder (juli 2026):
 * provisión de fondos — géén factuur, geen BTW-vermelding, PF-reeks.
 * Aangemaakt als CONCEPT: eerst ter controle naar Paco, dan pas versturen.
 *
 * Draai:  npx tsx scripts/create-silvestre-fondos.ts
 */
import "./load-env";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { documents } from "../lib/db/schema";

async function main() {
  const [existing] = await db
    .select({ id: documents.id, docNumber: documents.docNumber })
    .from(documents)
    .where(and(eq(documents.kind, "fondos"), eq(documents.projectId, "4cb9735a-f50c-48c9-abf6-8321c5ddf95f")));
  if (existing) {
    console.log(`bestaat al: ${existing.docNumber} (${existing.id}) — overslaan`);
    process.exit(0);
  }

  // Zelfde nummering als insertNumberedDocument (PF-JAAR-####), hier eenmalig.
  const prefix = `PF-${new Date().getFullYear()}-`;
  const [row] = await db
    .select({ maxSeq: sql<number>`coalesce(max((regexp_replace(${documents.docNumber}, '^.*-', ''))::int), 0)` })
    .from(documents)
    .where(sql`${documents.docNumber} ~ ${`^${prefix}[0-9]+$`}`);
  const docNumber = `${prefix}${String((row?.maxSeq ?? 0) + 1).padStart(4, "0")}`;

  const [doc] = await db
    .insert(documents)
    .values({
      kind: "fondos",
      docNumber,
      status: "draft",
      title: "Provisión de fondos — proyecto Silvestre",
      projectId: "4cb9735a-f50c-48c9-abf6-8321c5ddf95f", // Silvestre
      contactId: "9e739e77-6c21-49d8-8674-2f9b44d9476e", // zelfde contact als FAC-2026-0028
      issueDate: new Date().toISOString().slice(0, 10),
      currency: "EUR",
      subtotalEur: "10000.00",
      taxEur: "0",
      totalEur: "10000.00",
      isAdvance: true,
      vatReverseCharge: false,
      items: [
        {
          name: "Provisión de fondos para gastos en el proyecto de construcción Silvestre",
          units: 1,
          price: 10000,
          taxRate: 0,
        },
      ],
      notes:
        "Vervangt FAC-2026-0028 (verkeerd als factuur met BTW-verlegging uitgegeven aan particuliere klant). CONCEPT — eerst ter controle naar Paco vóór verzending.",
    })
    .returning({ id: documents.id, docNumber: documents.docNumber });
  console.log(`aangemaakt: ${doc.docNumber} (${doc.id}) — status concept`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
