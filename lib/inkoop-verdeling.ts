/**
 * Waar is een inkoopfactuur terechtgekomen?
 *
 * Een factuur die over meerdere werven wordt verdeeld, hangt met opzet NIET
 * zelf aan een project: `purchase_orders.project_id` blijft leeg, want anders
 * telt het hele bedrag óók nog eens op één werf bovenop de verdeelde regels
 * (zie `approveInvoiceReview` in lib/purchase-invoice-intake.ts). De koppeling
 * zit dan in de regels die eruit ontstaan: uren in `time_entries` of
 * kostenregels in `project_costs`, allebei met deze inkooporder als bron.
 *
 * Wie alleen naar `project_id` kijkt, ziet bij die facturen dus niets — en dat
 * las als "mijn koppeling is niet opgeslagen". Deze functie is het antwoord op
 * die vraag, op één plek, zodat het overzicht en de detailpagina niet uit
 * elkaar kunnen lopen.
 */
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectCosts, projects, timeEntries } from "@/lib/db/schema";

export type InkoopDeel = {
  projectId: string | null;
  projectNaam: string | null;
  /** Arbeid (urenregel) of materiaal (kostenregel) — bepaalt waar het op de werf landt. */
  soort: "uren" | "materiaal";
  /** Alleen bij arbeid; bij materiaal null. */
  uren: number | null;
  bedrag: number;
  /** Laatste datum van de regels, om naast het bedrag te tonen. */
  datum: string | null;
};

/**
 * De verdeling van één inkooporder, grootste bedrag eerst.
 * Leeg = deze factuur is nergens op een werf geboekt.
 */
export async function verdelingVanInkoop(purchaseOrderId: string): Promise<InkoopDeel[]> {
  const alles = await verdelingPerInkoop([purchaseOrderId]);
  return alles.get(purchaseOrderId) ?? [];
}

/** Dezelfde verdeling voor een hele lijst tegelijk — één query per soort. */
export async function verdelingPerInkoop(purchaseOrderIds: string[]): Promise<Map<string, InkoopDeel[]>> {
  const uniek = [...new Set(purchaseOrderIds)];
  const kaart = new Map<string, InkoopDeel[]>();
  if (uniek.length === 0) return kaart;

  const [uren, kosten] = await Promise.all([
    db
      .select({
        poId: timeEntries.purchaseOrderId,
        projectId: timeEntries.projectId,
        naam: projects.name,
        uren: sql<number>`sum(${timeEntries.hours})::float8`,
        bedrag: sql<number>`sum(${timeEntries.hours} * ${timeEntries.hourlyCostEur})::float8`,
        datum: sql<string>`max(${timeEntries.date})`,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(inArray(timeEntries.purchaseOrderId, uniek))
      .groupBy(timeEntries.purchaseOrderId, timeEntries.projectId, projects.name),
    db
      .select({
        poId: projectCosts.purchaseOrderId,
        projectId: projectCosts.projectId,
        naam: projects.name,
        bedrag: sql<number>`sum(${projectCosts.amountEur})::float8`,
        datum: sql<string>`max(${projectCosts.date})`,
      })
      .from(projectCosts)
      .leftJoin(projects, eq(projects.id, projectCosts.projectId))
      .where(inArray(projectCosts.purchaseOrderId, uniek))
      .groupBy(projectCosts.purchaseOrderId, projectCosts.projectId, projects.name),
  ]);

  const voegToe = (poId: string | null, deel: InkoopDeel) => {
    if (!poId) return;
    const lijst = kaart.get(poId);
    if (lijst) lijst.push(deel);
    else kaart.set(poId, [deel]);
  };

  for (const r of uren) {
    voegToe(r.poId, {
      projectId: r.projectId,
      projectNaam: r.naam,
      soort: "uren",
      uren: r.uren != null ? Number(r.uren) : null,
      bedrag: Number(r.bedrag ?? 0),
      datum: r.datum ?? null,
    });
  }
  for (const r of kosten) {
    voegToe(r.poId, {
      projectId: r.projectId,
      projectNaam: r.naam,
      soort: "materiaal",
      uren: null,
      bedrag: Number(r.bedrag ?? 0),
      datum: r.datum ?? null,
    });
  }
  for (const lijst of kaart.values()) lijst.sort((a, b) => b.bedrag - a.bedrag);
  return kaart;
}
