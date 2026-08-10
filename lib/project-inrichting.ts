import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  activities,
  contacts,
  documents,
  projectBudgetLines,
  projectPhases,
  projects,
  type DocumentLineItem,
  type DocumentPhase,
} from "@/lib/db/schema";
import { computeTotals, normalizeDocItems } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";

/**
 * Na akkoord op een gecalculeerde offerte (prijzenboek, herkenbaar aan de
 * hoofdstuk-fases): richt het project in. Geen project gekoppeld → aanmaken
 * met aanneemsom, contractdatum en onvoorzien-%; wel gekoppeld → lege
 * contractvelden aanvullen. Budgetregels per hoofdstuk (verkoop + geraamde
 * kost) alleen als het project er nog geen heeft — nooit dubbel.
 *
 * Staat in lib (niet in een "use server"-bestand): wordt aangeroepen vanuit
 * zowel de interne status-actie als de publieke klant-accept, en mag zelf
 * nooit een publiek aanroepbare server action worden.
 */
export async function richtProjectInNaAkkoord(estimateId: string, userId: string | null) {
  const est = await db.query.documents.findFirst({ where: eq(documents.id, estimateId) });
  if (!est || est.kind !== "estimate") return;
  const phases = (est.phases as DocumentPhase[] | null) ?? [];
  if (phases.length === 0) return; // gewone offerte — niets inrichten

  const items = normalizeDocItems(est.items);
  const onvoorzienPct = items
    .map((it) => /Onvoorzien \((\d+(?:[.,]\d+)?)%\)/.exec(it.name ?? ""))
    .map((m) => (m ? Number(m[1].replace(",", ".")) : null))
    .find((v) => v != null);

  let projectId = est.projectId;
  const vandaag = new Date().toISOString().slice(0, 10);
  if (!projectId) {
    const contact = est.contactId ? await db.query.contacts.findFirst({ where: eq(contacts.id, est.contactId) }) : null;
    const [nieuw] = await db
      .insert(projects)
      .values({
        name: `Verbouwing ${contact?.name ?? est.docNumber ?? ""}`.trim(),
        contactId: est.contactId,
        propertyId: est.propertyId,
        contractPriceEur: est.subtotalEur,
        contractDate: vandaag,
        contingencyPct: onvoorzienPct != null ? String(onvoorzienPct) : null,
      })
      .returning({ id: projects.id });
    projectId = nieuw.id;
    await db.update(documents).set({ projectId, updatedAt: new Date() }).where(eq(documents.id, estimateId));
  } else {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (project) {
      await db
        .update(projects)
        .set({
          contractPriceEur: project.contractPriceEur ?? est.subtotalEur,
          contractDate: project.contractDate ?? vandaag,
          contingencyPct: project.contingencyPct ?? (onvoorzienPct != null ? String(onvoorzienPct) : null),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
    }
  }

  const heeftBudget = await db.query.projectBudgetLines.findFirst({
    where: eq(projectBudgetLines.projectId, projectId),
    columns: { id: true },
  });
  let budgetregels = 0;
  if (!heeftBudget) {
    const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
    const hoofdstukken = phases.map((f) => f.label ?? f.key);
    for (const [i, hoofdstuk] of hoofdstukken.entries()) {
      const regels = items.filter((it) => it.phase === hoofdstuk || it.phase === phases[i]?.key);
      if (regels.length === 0) continue;
      const verkoop = regels.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.units) || 0), 0);
      const kost = regels.reduce((s, it) => s + (Number(it.costEur) || 0) * (Number(it.units) || 0), 0);
      await db.insert(projectBudgetLines).values({
        projectId,
        category: "other",
        phase: hoofdstuk,
        description: hoofdstuk,
        amountEur: round2(verkoop),
        estimatedCostEur: kost > 0 ? round2(kost) : null,
        isStelpost: regels.some((it) => /Stelpost:/.test(it.description ?? "")),
        sortOrder: i,
      });
      budgetregels++;
    }
  }

  // Fases voor de voortgang: dezelfde hoofdstukken als de budgetregels, elk
  // met een groene balk op het project (en in de klant-voortgangs-PDF).
  // Alleen als het project nog geen fases heeft — nooit dubbel.
  const heeftFases = await db.query.projectPhases.findFirst({
    where: eq(projectPhases.projectId, projectId),
    columns: { id: true },
  });
  if (!heeftFases) {
    const hoofdstukken = phases.map((f) => f.label ?? f.key);
    for (const [i, hoofdstuk] of hoofdstukken.entries()) {
      if (!items.some((it) => it.phase === hoofdstuk || it.phase === phases[i]?.key)) continue;
      await db.insert(projectPhases).values({ projectId, name: hoofdstuk, sortOrder: i });
    }
  }

  // Betalingsschema → per termijn een concept-proforma op het project, zodat
  // er precies volgens het schema gefactureerd wordt. Proforma's (PRO-reeks)
  // en geen facturen: de FAC-nummering blijft chronologisch — de factuur maak
  // je pas als de termijn echt opgevraagd wordt. Nooit dubbel aanmaken.
  const schema = (est.paymentSchedule ?? []).filter((t) => t.pct > 0 && t.amountEur > 0);
  let termijnDocs = 0;
  if (schema.length > 0) {
    const alBestaand = await db.query.documents.findFirst({
      where: and(eq(documents.sourceDocumentId, estimateId), eq(documents.kind, "proforma")),
      columns: { id: true },
    });
    if (!alBestaand) {
      const round2s = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
      for (const [i, t] of schema.entries()) {
        const item: DocumentLineItem = {
          name: `Termijn ${i + 1} (${t.pct}%) — ${t.label}`,
          description: `Conform het betalingsschema van offerte ${est.docNumber ?? ""}`.trim(),
          units: 1,
          price: t.amountEur,
          taxRate: 21,
          category: "renovatie",
        };
        const totalsT = computeTotals([item]);
        await insertNumberedDocument("proforma", {
          kind: "proforma",
          status: "draft",
          isAdvance: true,
          sourceDocumentId: estimateId,
          title: `Termijn ${i + 1} — ${t.label}`,
          contactId: est.contactId,
          companyId: est.companyId,
          propertyId: est.propertyId,
          projectId,
          issueDate: vandaag,
          currency: est.currency,
          subtotalEur: round2s(totalsT.subtotal),
          taxEur: round2s(totalsT.tax),
          totalEur: round2s(totalsT.total),
          items: [item],
        });
        termijnDocs++;
      }
    }
  }

  await db.insert(activities).values({
    type: "note",
    subject: `Project ingericht na akkoord op ${est.docNumber ?? "offerte"}`,
    body: `Aanneemsom ${est.subtotalEur ?? "?"} ex btw · contractdatum ${vandaag}${
      budgetregels ? ` · ${budgetregels} budgetregels uit de offerte-hoofdstukken` : " · budgetregels bestonden al"
    }${termijnDocs ? ` · ${termijnDocs} termijn-proforma's klaargezet volgens het betalingsschema` : ""}`,
    contactId: est.contactId,
    documentId: estimateId,
    authorId: userId,
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}
