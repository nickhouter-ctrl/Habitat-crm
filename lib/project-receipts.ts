/**
 * Betaalde factuur → ontvangst op het project.
 *
 * Waarom dit bestaat: "Ontvangen van klant" leest `project_payments`, en dat
 * werd alleen met de hand gevuld. Een factuur die op *betaald* stond, telde dus
 * nergens als ontvangst — een project met één betaalde factuur van € 26.729,54
 * liet € 0,00 ontvangen zien en een saldo van − € 14.629,49.
 *
 * De regel wordt gekoppeld via `document_id`, niet via de omschrijving. Dat is
 * het verschil tussen "één ontvangst per factuur" en de omschrijving-matching
 * die er eerst was: bij Finca Lisa en Het Palijsje staan handmatig ingevoerde
 * regels met teksten als "Habitat — badkamer (factuur F260022)" die op dezelfde
 * factuur doelen. Die worden hier ONTZIEN, anders staat het bedrag er twee keer.
 */
import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents, projectPayments } from "@/lib/db/schema";

/** Ontvangsten worden incl. btw geboekt; een creditnota gaat eraf. */
function ontvangenBedrag(kind: string, paidEur: string | null, totalEur: string | null): number {
  const bedrag = Number(paidEur ?? 0) || Number(totalEur ?? 0);
  return kind === "creditnote" ? -bedrag : bedrag;
}

/**
 * Bestaat er al een handmatige regel die deze factuur dekt? Twee signalen, beide
 * gezien in de echte data:
 *  - het factuurnummer staat in de omschrijving ("... (factuur F260022)");
 *  - het bedrag komt exact overeen (Het Palijsje: "Factuur F260018 (Habitat)"
 *    € 21.498,38 hoort bij FAC-2026-0020 — ander nummer, zelfde bedrag).
 * Bij twijfel boeken we NIET: een ontbrekende ontvangst valt op, een dubbele niet.
 */
export async function alGedekt(args: {
  projectId: string;
  docNumber: string | null;
  amount: number;
}): Promise<boolean> {
  const genormaliseerd = args.docNumber?.replace(/[^0-9a-z]/gi, "") ?? "";
  const rows = await db
    .select({ id: projectPayments.id, description: projectPayments.description, amountEur: projectPayments.amountEur })
    .from(projectPayments)
    .where(and(eq(projectPayments.projectId, args.projectId), isNull(projectPayments.documentId)));

  // De boekhouding boekt soms de NETTO ontvangst: "Factuur F260017 minus
  // creditnota CN260011" € 26.398,41 hoort bij een factuur van € 33.930,66 met
  // een creditnota van € 7.532,25. Zonder deze regel wordt de factuur nog eens
  // los geboekt en staat er € 33.930,66 te veel op het project.
  const creditnotas = await db
    .select({ paid: documents.paidEur, total: documents.totalEur })
    .from(documents)
    .where(and(eq(documents.projectId, args.projectId), eq(documents.kind, "creditnote")));
  const nettoVarianten = creditnotas
    .map((c) => Number(c.paid ?? 0) || Number(c.total ?? 0))
    .filter((n) => n > 0)
    .map((n) => Math.abs(args.amount) - n);

  return rows.some((r) => {
    const bedrag = Number(r.amountEur ?? 0);
    if (genormaliseerd) {
      const tekst = (r.description ?? "").replace(/[^0-9a-z]/gi, "");
      if (tekst.includes(genormaliseerd)) return true;
      // Nummers verschillen soms per reeks (F260018 vs FAC-2026-0020); de
      // laatste vier cijfers zijn dan nog wel gelijk.
      const staart = genormaliseerd.slice(-4);
      if (staart.length === 4 && /\d{4}/.test(staart) && tekst.includes(staart)) return true;
    }
    if (Math.abs(bedrag - Math.abs(args.amount)) < 0.5) return true;
    return nettoVarianten.some((n) => Math.abs(bedrag - n) < 0.5);
  });
}

export type ReceiptSyncResult = "inserted" | "updated" | "removed" | "skipped-covered" | "noop";

/**
 * Zet de ontvangst gelijk aan de betaalstand van één document. Idempotent:
 * meerdere keren aanroepen levert nooit een tweede regel op, en gaat het
 * document terug naar concept/verstuurd, dan verdwijnt de ontvangst weer.
 */
export async function syncProjectReceiptFromDocument(documentId: string): Promise<ReceiptSyncResult> {
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, documentId),
    columns: {
      id: true,
      kind: true,
      status: true,
      docNumber: true,
      projectId: true,
      isAdvance: true,
      paidEur: true,
      totalEur: true,
    },
  });
  if (!doc?.projectId) return "noop";

  const bestaand = await db.query.projectPayments.findFirst({
    where: eq(projectPayments.documentId, doc.id),
    columns: { id: true, amountEur: true },
  });

  const betaald = doc.status === "paid" || doc.status === "partially_paid";
  if (!betaald) {
    if (bestaand) {
      await db.delete(projectPayments).where(eq(projectPayments.id, bestaand.id));
      return "removed";
    }
    return "noop";
  }

  const amount = ontvangenBedrag(doc.kind, doc.paidEur, doc.totalEur);
  if (amount === 0) return "noop";

  // Voorschotten houden hun eigen conventie: methode 'advance' en de marker
  // "Voorschot <nummer>", waar de aanneemprijs-berekening op leunt.
  const isVoorschot = doc.kind === "proforma" || doc.kind === "fondos" || doc.isAdvance === true;
  const omschrijving = isVoorschot
    ? `Voorschot ${doc.docNumber ?? doc.id.slice(0, 8)}`
    : `${doc.kind === "creditnote" ? "Creditnota" : "Factuur"} ${doc.docNumber ?? doc.id.slice(0, 8)}`;

  if (bestaand) {
    if (Number(bestaand.amountEur ?? 0) === amount) return "noop";
    await db
      .update(projectPayments)
      .set({ amountEur: String(amount), updatedAt: new Date() })
      .where(eq(projectPayments.id, bestaand.id));
    return "updated";
  }

  // Legacy: de voorschotboeking van vóór deze koppeling gebruikte alleen de
  // marker-omschrijving. Zo'n regel adopteren in plaats van er één bij zetten.
  const marker = `Voorschot ${doc.docNumber ?? doc.id.slice(0, 8)}`;
  const legacy = await db.query.projectPayments.findFirst({
    where: and(
      eq(projectPayments.projectId, doc.projectId),
      isNull(projectPayments.documentId),
      or(eq(projectPayments.description, marker), eq(projectPayments.description, doc.docNumber ?? marker)),
    ),
    columns: { id: true },
  });
  if (legacy) {
    await db
      .update(projectPayments)
      .set({ documentId: doc.id, amountEur: String(amount), updatedAt: new Date() })
      .where(eq(projectPayments.id, legacy.id));
    return "updated";
  }

  if (await alGedekt({ projectId: doc.projectId, docNumber: doc.docNumber, amount })) return "skipped-covered";

  await db.insert(projectPayments).values({
    projectId: doc.projectId,
    documentId: doc.id,
    amountEur: String(amount),
    method: isVoorschot ? "advance" : "invoice",
    // Wanneer het geld precies binnenkwam legt het systeem niet vast; de dag van
    // afboeken is het beste dat we hebben (zelfde keuze als de oude voorschotboeking).
    date: new Date().toISOString().slice(0, 10),
    description: omschrijving,
    note: "Automatisch via betaalde factuur",
  });
  return "inserted";
}
