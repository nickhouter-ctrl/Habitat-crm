"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  activities,
  documents,
  projectBudgetLines,
  projectCosts,
  projectExtras,
  projectPayments,
  projectPhases,
  projects,
  purchaseOrders,
  timeEntries,
  workerPortalLinks,
  workers,
  type DocumentLineItem,
  type DocumentPhase,
} from "@/lib/db/schema";
import { poExVatAssumingSpanishVat } from "@/lib/purchase-orders";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { quoteClauses } from "@/lib/quote-clauses";
import { renderBudgetPdf } from "@/lib/budget-pdf";
import { brandedEmail, escapeHtml, sendEmail } from "@/lib/email";
import { recordSentEmail } from "@/lib/sent-email";
import { COMPANY } from "@/lib/company";
import { formatEUR } from "@/lib/utils";
import { workerRate } from "@/lib/worker-rate";
import { moneyOrNull, moneyOrZero as numOrZero } from "@/lib/parse-money";

async function requireUser() {
  // Centrale guard: ingelogd én geen alleen-lezen (viewer) account.
  return requireWriteUser();
}

// Bedragen inlezen gebeurt centraal: zie lib/parse-money.ts voor waarom de
// oude "alle punten zijn duizendtallen"-aanpak fout ging op "3800.000000".

const createSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  description: z.string().trim().optional(),
  code: z.string().trim().optional(),
  contactId: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
  propertyId: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

export async function createProject(formData: FormData) {
  await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  // Dubbele namen ("oliva hotel" naast "Oliva Hotel") betekenen uren en kosten
  // die op het verkeerde scherm terechtkomen — blokkeren met een duidelijke fout.
  const dubbel = await db.query.projects.findFirst({
    where: sql`lower(trim(${projects.name})) = ${d.name.toLowerCase()}`,
    columns: { id: true, name: true },
  });
  if (dubbel) throw new Error(`Er bestaat al een project met deze naam: "${dubbel.name}". Open dat project, of kies een andere naam.`);
  const [row] = await db
    .insert(projects)
    .values({
      name: d.name,
      description: d.description || null,
      code: d.code || null,
      status: "active",
      contactId: uuidOrNull(d.contactId),
      ownerId: uuidOrNull(d.ownerId),
      propertyId: uuidOrNull(d.propertyId),
      startDate: dateOrNull(d.startDate),
      endDate: dateOrNull(d.endDate),
    })
    .returning({ id: projects.id });
  revalidatePath("/deals");
  revalidatePath("/projects");
  redirect(`/projects/${row.id}`);
}

const updateSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  description: z.string().trim().optional(),
  code: z.string().trim().optional(),
  status: z.enum(["active", "completed", "archived"]).default("active"),
  kind: z.enum(["sales", "construction"]).default("sales"),
  contractPriceEur: z.string().trim().optional(),
  budgetHours: z.string().trim().optional(),
  contingencyPct: z.string().trim().optional(),
  laborMarginPct: z.string().trim().optional(),
  purchaseMarginPct: z.string().trim().optional(),
  siteAlias: z.string().trim().max(300).optional(),
  contactId: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
  propertyId: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  contractDate: z.string().trim().optional(),
});

function uuidOrNull(v?: string) {
  return v && v.length === 36 ? v : null;
}
function dateOrNull(v?: string) {
  return v && v.length ? v : null;
}

export async function updateProject(id: string, formData: FormData) {
  await requireUser();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db
    .update(projects)
    .set({
      name: d.name,
      description: d.description || null,
      code: d.code || null,
      status: d.status,
      kind: d.kind,
      contractPriceEur: moneyOrNull(d.contractPriceEur),
      budgetHours: moneyOrNull(d.budgetHours),
      contingencyPct: moneyOrNull(d.contingencyPct),
      laborMarginPct: moneyOrNull(d.laborMarginPct),
      purchaseMarginPct: moneyOrNull(d.purchaseMarginPct),
      siteAlias: d.siteAlias || null,
      contactId: uuidOrNull(d.contactId),
      ownerId: uuidOrNull(d.ownerId),
      propertyId: uuidOrNull(d.propertyId),
      startDate: dateOrNull(d.startDate),
      endDate: dateOrNull(d.endDate),
      contractDate: dateOrNull(d.contractDate),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await requireUser();
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect("/projects");
}

/** Markeer een project als afgerond (of heropen het). */
export async function setProjectStatus(id: string, status: "active" | "completed" | "archived") {
  await requireUser();
  await db.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}

/** Koppel een bestaand document (factuur/offerte) aan dit project. */
export async function attachDocumentToProject(projectId: string, formData: FormData) {
  await requireUser();
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (documentId.length !== 36) return;
  await db.update(documents).set({ projectId, updatedAt: new Date() }).where(eq(documents.id, documentId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/documents/${documentId}`);
}

/* ----------------------------------------------------------- uren (arbeid) */

const timeEntrySchema = z.object({
  workerId: z.string().trim().optional(),
  date: z.string().trim().min(1, "Datum is verplicht"),
  hours: z.string().trim().min(1, "Uren zijn verplicht"),
  hourlyCostEur: z.string().trim().optional(),
  paymentMethod: z.enum(["cash", "invoice"]).default("invoice"),
  note: z.string().trim().optional(),
});

export async function addTimeEntry(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = timeEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const workerId = uuidOrNull(d.workerId);
  // Tarief: expliciet ingevuld wint; anders het tarief van de arbeider dat bij
  // DEZE betaalwijze hoort — contant werken gaat vaak tegen een ander tarief.
  let rate = moneyOrNull(d.hourlyCostEur);
  let workerName: string | null = null;
  if (workerId) {
    const w = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });
    workerName = w?.name ?? null;
    if (rate == null) {
      const tarief = workerRate(w, d.paymentMethod);
      rate = tarief != null ? String(tarief) : null;
    }
  }
  await db.insert(timeEntries).values({
    projectId,
    workerId,
    workerName,
    date: d.date,
    hours: numOrZero(d.hours),
    hourlyCostEur: rate ?? "0",
    paymentMethod: d.paymentMethod,
    note: d.note || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

const timeEntryUpdateSchema = z.object({
  date: z.string().trim().optional(),
  hours: z.string().trim().min(1, "Uren zijn verplicht"),
  hourlyCostEur: z.string().trim().min(1, "Tarief is verplicht"),
  paymentMethod: z.enum(["cash", "invoice"]).default("cash"),
  note: z.string().trim().optional(),
});

/** Pas een bestaande urenregel aan (uren/tarief → kosten = uren × tarief). */
export async function updateTimeEntry(projectId: string, entryId: string, formData: FormData) {
  await requireUser();
  const parsed = timeEntryUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;

  const uren = Number(numOrZero(d.hours));
  let tarief = numOrZero(d.hourlyCostEur);

  // Hangt deze regel aan een inkoopfactuur, dan is het FACTUURBEDRAG leidend en
  // volgt het tarief uit de uren — niet andersom. Anders levert elke deling die
  // niet opgaat een tekort op: 3.800 ÷ 28 = 135,714…, en 135,71 × 28 boekt
  // € 3.799,88, twaalf cent minder dan de leverancier vraagt.
  //
  // Alléén als die factuur precies ÉÉN urenregel heeft. Bij een weekfactuur die
  // over meerdere dagen of werven is uitgesplitst (Factura nº 2 staat op vier
  // regels) dekt elke regel maar een deel, en zou dit elke regel op het hele
  // factuurbedrag zetten — vier keer € 3.016 in plaats van één keer.
  const bestaand = await db.query.timeEntries.findFirst({
    where: eq(timeEntries.id, entryId),
    columns: { purchaseOrderId: true },
  });
  if (bestaand?.purchaseOrderId && uren > 0) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(eq(timeEntries.purchaseOrderId, bestaand.purchaseOrderId));
    const po = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.id, bestaand.purchaseOrderId),
      columns: { subtotal: true, total: true, tax: true, items: true, countAsLabor: true },
    });
    if (n === 1 && po?.countAsLabor) {
      // poExVatAssumingSpanishVat, niet het factuurtotaal: bij Ahmed en Zerghini
      // staat er geen btw-uitsplitsing op en is de arbeidskost het bedrag ÷ 1,21.
      const { amount } = poExVatAssumingSpanishVat(po);
      if (amount > 0) tarief = (amount / uren).toFixed(6);
    }
  }

  await db
    .update(timeEntries)
    .set({
      date: dateOrNull(d.date) ?? undefined,
      hours: String(uren),
      hourlyCostEur: tarief,
      paymentMethod: d.paymentMethod,
      note: d.note?.trim() ? d.note : null,
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, entryId));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTimeEntry(projectId: string, entryId: string) {
  await requireUser();
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  revalidatePath(`/projects/${projectId}`);
}

/** Keur een portaal-urenregel goed — vanaf dan telt hij mee in de kosten. */
export async function approveTimeEntry(projectId: string, entryId: string) {
  await requireUser();
  await db
    .update(timeEntries)
    .set({ approvedAt: new Date(), updatedAt: new Date() })
    .where(eq(timeEntries.id, entryId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

/** Keur alle openstaande portaal-uren van dit project in één keer goed. */
export async function approveAllPendingTimeEntries(projectId: string) {
  await requireUser();
  await db
    .update(timeEntries)
    .set({ approvedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        isNotNull(timeEntries.selfLoggedAt),
        isNull(timeEntries.approvedAt),
      ),
    );
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
}

/* ------------------------------------------- urenportaal-links (per project) */

/** Verwijs een arbeider/ploegbaas naar dit project: maak z'n portaal-link. */
export async function createWorkerPortalLink(projectId: string, formData: FormData) {
  await requireUser();
  const workerId = uuidOrNull(String(formData.get("workerId") ?? ""));
  if (!workerId) throw new Error("Kies een arbeider");
  const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
  await db
    .insert(workerPortalLinks)
    .values({ workerId, projectId, token })
    .onConflictDoNothing(); // bestaat de combinatie al, dan blijft de oude link geldig
  revalidatePath(`/projects/${projectId}`);
}

/** Portaal-link intrekken (de link werkt daarna direct niet meer). */
export async function deleteWorkerPortalLink(projectId: string, linkId: string) {
  await requireUser();
  await db.delete(workerPortalLinks).where(eq(workerPortalLinks.id, linkId));
  revalidatePath(`/projects/${projectId}`);
}

/* ------------------------------------------------ losse projectkosten (inkoop) */

const costSchema = z.object({
  date: z.string().trim().min(1, "Datum is verplicht"),
  category: z.enum(["material", "subcontractor", "equipment", "other"]).default("material"),
  description: z.string().trim().min(1, "Omschrijving is verplicht"),
  supplier: z.string().trim().optional(),
  amountEur: z.string().trim().optional(),
  /** Doorbelaste klantprijs (ex. btw) — leeg = standaardnorm kost + marge. */
  chargeEur: z.string().trim().optional(),
  paymentMethod: z.enum(["cash", "invoice"]).default("invoice"),
  note: z.string().trim().optional(),
});

export async function addProjectCost(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = costSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db.insert(projectCosts).values({
    projectId,
    date: d.date,
    category: d.category,
    description: d.description,
    supplier: d.supplier || null,
    amountEur: numOrZero(d.amountEur),
    chargeEur: d.chargeEur?.trim() ? numOrZero(d.chargeEur) : null,
    paymentMethod: d.paymentMethod,
    note: d.note || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectCost(projectId: string, costId: string) {
  await requireUser();
  await db.delete(projectCosts).where(eq(projectCosts.id, costId));
  revalidatePath(`/projects/${projectId}`);
}

/* ----------------------------------------- ontvangen betalingen (van klant) */

const paymentSchema = z.object({
  date: z.string().trim().optional(),
  amountEur: z.string().trim().min(1, "Bedrag is verplicht"),
  method: z.enum(["cash", "bank", "invoice", "advance", "other"]).default("bank"),
  description: z.string().trim().optional(),
  note: z.string().trim().optional(),
  /** Hoort deze ontvangst bij een eerder verstuurd voorschotverzoek? */
  advanceRequestId: z.string().trim().optional(),
  /** Leeg = het systeem beslist (contant 0%, bij een factuur die factuur, anders 21%). */
  vatRate: z.string().trim().optional(),
  /** Btw-bedrag; wint van het tarief. Voor facturen met gemengde tarieven. */
  vatAmountEur: z.string().trim().optional(),
});

export async function addProjectPayment(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const advanceRequestId = uuidOrNull(d.advanceRequestId);
  await db.insert(projectPayments).values({
    projectId,
    date: dateOrNull(d.date),
    amountEur: numOrZero(d.amountEur),
    // Hoort de ontvangst bij een voorschotverzoek, dan is het per definitie een
    // voorschot — anders zou hetzelfde bedrag als 'bank' de voorschotstand niet raken.
    method: advanceRequestId ? "advance" : d.method,
    description: d.description || null,
    note: d.note || null,
    advanceRequestId,
    vatRate: d.vatRate ? moneyOrNull(d.vatRate) : null,
    vatAmountEur: d.vatAmountEur ? moneyOrNull(d.vatAmountEur) : null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectPayment(projectId: string, paymentId: string) {
  await requireUser();
  await db.delete(projectPayments).where(eq(projectPayments.id, paymentId));
  revalidatePath(`/projects/${projectId}`);
}

/* -------------------------------------------- inkooporder ↔ project koppelen */

export async function linkPurchaseOrderToProject(projectId: string, formData: FormData) {
  await requireUser();
  const poId = String(formData.get("purchaseOrderId") ?? "").trim();
  if (poId.length !== 36) return;
  await db.update(purchaseOrders).set({ projectId, updatedAt: new Date() }).where(eq(purchaseOrders.id, poId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/inkooporders/${poId}`);
}

export async function unlinkPurchaseOrder(projectId: string, poId: string) {
  await requireUser();
  await db.update(purchaseOrders).set({ projectId: null, updatedAt: new Date() }).where(eq(purchaseOrders.id, poId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/inkooporders/${poId}`);
}

/* ------------------------------------------------------------- begroting */

const budgetSchema = z.object({
  category: z.enum(["labor", "material", "subcontractor", "equipment", "other"]).default("other"),
  section: z.string().trim().optional(),
  phase: z.string().trim().optional(),
  description: z.string().trim().min(1, "Omschrijving is verplicht"),
  quantity: z.string().trim().optional(),
  unitPriceEur: z.string().trim().optional(),
  amountEur: z.string().trim().optional(),
  estimatedCostEur: z.string().trim().optional(),
  isStelpost: z.union([z.literal("on"), z.literal("")]).optional(),
  note: z.string().trim().optional(),
});

/** Targetprijs: qty×eenheidsprijs indien beide ingevuld, anders het losse bedrag. */
function budgetAmount(qty: string | null, unit: string | null, amount: string | null): string {
  if (qty != null && unit != null) return String(Math.round(Number(qty) * Number(unit) * 100) / 100);
  return amount ?? "0";
}

export async function addBudgetLine(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const qty = moneyOrNull(d.quantity);
  const unit = moneyOrNull(d.unitPriceEur);
  await db.insert(projectBudgetLines).values({
    projectId,
    category: d.category,
    section: d.section || null,
    phase: d.phase || null,
    description: d.description,
    quantity: qty,
    unitPriceEur: unit,
    amountEur: budgetAmount(qty, unit, moneyOrNull(d.amountEur)),
    estimatedCostEur: moneyOrNull(d.estimatedCostEur),
    isStelpost: d.isStelpost === "on",
    note: d.note || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBudgetLine(projectId: string, lineId: string) {
  await requireUser();
  await db.delete(projectBudgetLines).where(eq(projectBudgetLines.id, lineId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/begroting`);
}

/** Stuur de begroting als PDF naar de klant (e-mail). */
export async function sendBudgetToClient(projectId: string) {
  await requireUser();
  const pdf = await renderBudgetPdf(projectId);
  if (!pdf) redirect(`/projects/${projectId}/begroting?mail=geenproject`);
  if (!pdf.contactEmail) redirect(`/projects/${projectId}/begroting?mail=geenadres`);

  const html = `
    <p>Beste klant,</p>
    <p>In de bijlage vind je de begroting voor <strong>${pdf.projectName}</strong>, opgedeeld per fase.
    Alle bedragen zijn exclusief btw. Heb je vragen of wil je iets aanpassen? Laat het gerust weten.</p>
    <p>Met vriendelijke groet,<br/>${COMPANY.legalName}<br/>${COMPANY.email} · ${COMPANY.website}</p>
  `;
  const text = `Beste klant,\n\nIn de bijlage vind je de begroting voor ${pdf.projectName}, opgedeeld per fase (excl. btw).\n\nMet vriendelijke groet,\n${COMPANY.legalName}\n${COMPANY.email} · ${COMPANY.website}`;

  const res = await sendEmail({
    to: pdf.contactEmail,
    subject: `Begroting — ${pdf.projectName}`,
    html,
    text,
    attachments: [
      { filename: pdf.filename, content: new Uint8Array(pdf.buffer), contentType: "application/pdf" },
    ],
  });
  revalidatePath(`/projects/${projectId}/begroting`);
  redirect(`/projects/${projectId}/begroting?mail=${res.sent ? "ok" : "mislukt"}`);
}

/* ------------------------------------------------------------- projectfases */

const phaseSchema = z.object({
  name: z.string().trim().min(1, "Naam is verplicht"),
  description: z.string().trim().optional(),
  plannedWeeks: z.string().trim().optional(),
  sortOrder: z.string().trim().optional(),
});

export async function addProjectPhase(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  // Nieuwe fase achteraan tenzij expliciet een volgorde is meegegeven.
  const count = await db.$count(projectPhases, eq(projectPhases.projectId, projectId));
  await db.insert(projectPhases).values({
    projectId,
    name: d.name,
    description: d.description || null,
    plannedWeeks: d.plannedWeeks || null,
    sortOrder: d.sortOrder ? Number(d.sortOrder) : count,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function updateProjectPhase(projectId: string, phaseId: string, formData: FormData) {
  await requireUser();
  const parsed = phaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db
    .update(projectPhases)
    .set({
      name: d.name,
      description: d.description || null,
      plannedWeeks: d.plannedWeeks || null,
      sortOrder: d.sortOrder ? Number(d.sortOrder) : undefined,
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, phaseId));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectPhase(projectId: string, phaseId: string) {
  await requireUser();
  await db.delete(projectPhases).where(eq(projectPhases.id, phaseId));
  revalidatePath(`/projects/${projectId}`);
}

/**
 * Voortgang van een bouwfase (0–100%) — de groene balk op het project en in de
 * klant-voortgangs-PDF. Bestaat de fase nog niet als projectfase (ouder project
 * met alleen budgetregels), dan wordt hij hier alsnog aangemaakt.
 */
export async function setPhaseProgress(projectId: string, naam: string, pct: number) {
  await requireUser();
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const bestaand = await db.query.projectPhases.findFirst({
    where: and(eq(projectPhases.projectId, projectId), eq(projectPhases.name, naam)),
    columns: { id: true },
  });
  if (bestaand) {
    await db.update(projectPhases).set({ progressPct: p, updatedAt: new Date() }).where(eq(projectPhases.id, bestaand.id));
  } else {
    const count = await db.$count(projectPhases, eq(projectPhases.projectId, projectId));
    await db.insert(projectPhases).values({ projectId, name: naam, progressPct: p, sortOrder: count });
  }
  revalidatePath(`/projects/${projectId}`);
}

/* ------------------------------------------ offerte genereren uit de begroting */

/**
 * Maakt een concept-offerte uit de begroting: elke begrotingsregel wordt een
 * offerteregel (targetprijs = stuksprijs), met de fase ingevuld zodat je daarna
 * per fase kunt factureren. De projectfases (naam + omschrijving) komen als
 * `phases` op het document; een eventueel onvoorzien-% wordt als slotregel
 * toegevoegd. Koppelt de offerte meteen aan het project.
 */
export async function createEstimateFromBudget(projectId: string) {
  await requireUser();
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return;
  const [lines, phaseRows] = await Promise.all([
    db
      .select()
      .from(projectBudgetLines)
      .where(eq(projectBudgetLines.projectId, projectId))
      .orderBy(asc(projectBudgetLines.sortOrder), asc(projectBudgetLines.createdAt)),
    db.select().from(projectPhases).where(eq(projectPhases.projectId, projectId)).orderBy(asc(projectPhases.sortOrder)),
  ]);
  if (lines.length === 0) redirect(`/projects/${projectId}?begroting=leeg`);

  const items: DocumentLineItem[] = lines.map((l) => ({
    name: l.description,
    description: l.section ?? undefined,
    units: 1,
    price: Number(l.amountEur ?? 0),
    taxRate: 21,
    category: l.category === "labor" ? "arbeid" : "materiaal",
    phase: l.phase ?? undefined,
  }));

  // Onvoorzien als slotregel (percentage over het subtotaal van de regels).
  const pct = Number(project.contingencyPct ?? 0);
  if (pct > 0) {
    const sub = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.units) || 0), 0);
    items.push({
      name: `Onvoorzien (${pct}%)`,
      units: 1,
      price: Math.round(sub * (pct / 100) * 100) / 100,
      taxRate: 21,
      category: "materiaal",
    });
  }

  const phases: DocumentPhase[] = phaseRows.map((p) => ({
    key: p.name,
    label: p.name,
    note: p.description ?? undefined,
  }));

  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const { id } = await insertNumberedDocument("estimate", {
    kind: "estimate",
    status: "draft",
    title: `Offerte ${project.name}`,
    contactId: project.contactId,
    projectId,
    propertyId: project.propertyId,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    subtotalEur: round2(totals.subtotal),
    taxEur: round2(totals.tax),
    totalEur: round2(totals.total),
    items,
    phases: phases.length > 0 ? phases : null,
    // Zelfde voorbehouden als onder de gecalculeerde offerte — onvoorzien en
    // meerwerk moeten op élke offerte staan.
    notes: quoteClauses("nl"),
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/documents/${id}/edit`);
}

/* ------------------------------------------------ voorschot bij de klant opvragen */

const advanceRequestSchema = z.object({
  to: z.string().trim().email("Vul een geldig e-mailadres in"),
  subject: z.string().trim().min(1, "Onderwerp is verplicht"),
  /** De brief zoals hij op het scherm stond — dit gaat er letterlijk uit. */
  text: z.string().trim().min(20, "De brief is leeg"),
  amountEur: z.string().trim().optional(),
  termLabel: z.string().trim().optional(),
});

/**
 * Verstuurt het voorschotverzoek (NL + ES) aan de klant.
 *
 * De HTML wordt hier uit de BEWERKTE tekst opgebouwd, niet uit een meegestuurd
 * concept: anders kan de klant een andere brief lezen dan degene die is nagelezen.
 */
export async function sendAdvanceRequest(projectId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = advanceRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) redirect("/projects");
  const bedrag = d.amountEur ? Number(moneyOrNull(d.amountEur)) : null;

  // Regeleinden bewaren; de scheidingslijn tussen NL en ES als echte streep.
  const html = brandedEmail(
    d.text
      .split(/\n{2,}/)
      .map((blok) =>
        /^—{3,}$/.test(blok.trim())
          ? `<hr style="border:none;border-top:1px solid #e8dfd0;margin:24px 0">`
          : `<p style="margin:0 0 12px;white-space:pre-line">${escapeHtml(blok)}</p>`,
      )
      .join(""),
  );

  const res = await sendEmail({
    to: d.to,
    subject: d.subject,
    html,
    text: d.text,
    fromUser: { name: user.name },
  });

  if (res.sent) {
    await recordSentEmail({
      kind: "other",
      toEmail: d.to,
      subject: d.subject,
      html,
      text: d.text,
      contactId: project.contactId ?? null,
      projectId,
      amountEur: bedrag,
    });
    // Zelfde actie, drie brieven: het verzoek, de bevestiging na een
    // deelbetaling, en het verzoek om het restant. Het onderwerp verraadt welke.
    const soort = /^Voorschotstand/i.test(d.subject)
      ? "Ontvangst bevestigd"
      : /^Voorschot restant/i.test(d.subject)
        ? "Restant opgevraagd"
        : "Voorschot opgevraagd";
    await db.insert(activities).values({
      type: "note",
      subject: `${soort}: ${project.name}${d.termLabel ? ` (${d.termLabel})` : ""}`,
      body: `${d.amountEur ? `${soort === "Voorschot opgevraagd" ? "Bedrag" : "Nog open"}: €${d.amountEur} · ` : ""}Verstuurd aan ${d.to}.`,
      contactId: project.contactId ?? null,
      authorId: user.id,
    });
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?vmail=${res.sent ? "ok" : "mislukt"}#voorschot-opvragen`);
}

/* ------------------------------------------------------- eindafrekening */

/**
 * Maakt de eindafrekening als CONCEPT-factuur: wat er nog te factureren is,
 * met de ontvangen voorschotten er als aparte regels vanaf.
 *
 * Waarom die voorschotten er als negatieve regels op moeten: de klant heeft dat
 * geld al betaald, maar er stond geen factuur tegenover. Zet je alleen het
 * restant op de factuur, dan klopt de btw niet — over een voorschot is nog geen
 * btw afgedragen zolang er geen factuur voor was. Door het volledige bedrag te
 * factureren en het voorschot eronder af te trekken, wordt de btw over het hele
 * werk in één keer afgerekend en betaalt de klant alleen het verschil.
 *
 * Concept, niet verstuurd: dit is een voorstel dat nagelopen hoort te worden.
 */
export async function createFinalSettlement(projectId: string, formData?: FormData) {
  const user = await requireUser();
  // De klant hoeft op de factuur niet te lezen hoe hij betaald heeft. Met deze
  // optie komen alle voorschotten op één regel "Reeds ontvangen voorschotten".
  // De BEDRAGEN blijven volledig op de factuur staan — alleen de specificatie
  // per betaling verdwijnt. Voorschotten zonder btw blijven apart, want die
  // hebben een ander tarief en dat mag niet vermengd worden.
  const bundelVoorschotten = formData?.get("bundel") === "on";
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return;

  // Alles wat al op een eigen factuur staat (concept en geannuleerd tellen niet).
  const facturen = await db
    .select({ subtotal: documents.subtotalEur, kind: documents.kind, status: documents.status })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), inArray(documents.kind, ["invoice", "creditnote"])));
  const gefactureerd = facturen
    .filter((d) => d.status !== "draft" && d.status !== "void")
    .reduce((s, d) => s + (d.kind === "creditnote" ? -1 : 1) * Number(d.subtotal ?? 0), 0);

  // Ontvangsten zonder eigen factuur = voorschotten die verrekend moeten worden.
  const ontvangsten = await db
    .select({
      id: projectPayments.id,
      date: projectPayments.date,
      amountEur: projectPayments.amountEur,
      method: projectPayments.method,
      description: projectPayments.description,
      vatRate: projectPayments.vatRate,
      documentId: projectPayments.documentId,
    })
    .from(projectPayments)
    .where(and(eq(projectPayments.projectId, projectId), isNull(projectPayments.documentId)))
    .orderBy(asc(projectPayments.date));

  const doel = project.contractPriceEur != null ? Number(project.contractPriceEur) : 0;

  /**
   * De eindafrekening toont het HELE werk en trekt daar alles vanaf wat al is
   * gefactureerd of vooruitbetaald. Zo staat er één compleet stuk waar de klant
   * zijn hele project op terugziet, en hoeven de oude facturen niet mee.
   *
   * Dat is ook de Spaanse regel: op de factura final moeten de eerder
   * gefactureerde anticipos mét hun btw worden vermeld en afgetrokken
   * (RD 1619/2012 art. 6). De oude facturen blijven gewoon apart opeisbaar —
   * ze worden hier alleen verrekend, niet vervangen.
   */
  const items: DocumentLineItem[] = [];
  if (doel !== 0) {
    items.push({
      name: `Aanneemsom ${project.name}`,
      description: "het complete werk volgens overeenkomst",
      units: 1,
      price: doel,
      taxRate: 21,
      category: "materiaal",
    });
  }

  // Meerwerk komt BOVENOP de aanneemsom — aparte regels, zodat de klant ziet
  // waarvoor. Zonder akkoord blijft het er wel op staan, maar met een notitie:
  // weglaten zou het stil onder tafel schuiven.
  const meerwerk = await db
    .select()
    .from(projectExtras)
    .where(eq(projectExtras.projectId, projectId))
    .orderBy(asc(projectExtras.date));
  for (const m of meerwerk) {
    const bedrag = Number(m.amountEur ?? 0);
    if (bedrag === 0) continue;
    items.push({
      name: `Meerwerk: ${m.description}`,
      description: `${m.date ? new Date(m.date).toLocaleDateString("nl-NL") : ""}${
        m.approvedAt ? " · akkoord" : " · NOG GEEN AKKOORD"
      }`.trim(),
      units: 1,
      price: bedrag,
      taxRate: 21,
      category: "materiaal",
    });
  }

  // Elke eerdere factuur eraf, mét het btw-tarief dat erop stond.
  const eerder = await db
    .select({
      docNumber: documents.docNumber,
      issueDate: documents.issueDate,
      subtotal: documents.subtotalEur,
      tax: documents.taxEur,
      kind: documents.kind,
      status: documents.status,
    })
    .from(documents)
    .where(and(eq(documents.projectId, projectId), inArray(documents.kind, ["invoice", "creditnote"])));
  for (const f of eerder) {
    if (f.status === "draft" || f.status === "void") continue;
    const sub = Number(f.subtotal ?? 0) * (f.kind === "creditnote" ? -1 : 1);
    if (sub === 0) continue;
    const btw = Number(f.tax ?? 0);
    const pct = sub !== 0 && btw !== 0 ? Math.round((btw / Math.abs(sub)) * 100) : 0;
    items.push({
      name: `Reeds gefactureerd: ${f.docNumber ?? "factuur"}`,
      description: `${f.issueDate ? new Date(f.issueDate).toLocaleDateString("nl-NL") : ""}${
        f.status !== "paid" ? " · staat nog open, blijft apart opeisbaar" : ""
      }`.trim(),
      units: 1,
      price: -sub,
      taxRate: pct,
      category: "materiaal",
    });
  }
  if (bundelVoorschotten) {
    // Per btw-tarief één regel: tarieven mogen niet op één hoop.
    const perTarief = new Map<number, number>();
    for (const p of ontvangsten) {
      const bedrag = Number(p.amountEur ?? 0);
      const pct = p.vatRate != null ? Number(p.vatRate) : p.method === "cash" ? 0 : 21;
      const ex = Math.round((bedrag / (1 + pct / 100)) * 100) / 100;
      perTarief.set(pct, Math.round(((perTarief.get(pct) ?? 0) + ex) * 100) / 100);
    }
    for (const [pct, ex] of [...perTarief.entries()].sort((a, b) => b[0] - a[0])) {
      if (ex === 0) continue;
      items.push({
        name: "Reeds ontvangen voorschotten",
        description: pct === 0 ? "zonder btw ontvangen, btw wordt hier alsnog afgerekend" : `inclusief ${pct}% btw`,
        units: 1,
        price: -ex,
        taxRate: pct,
        category: "materiaal",
      });
    }
  }
  for (const p of bundelVoorschotten ? [] : ontvangsten) {
    const bedrag = Number(p.amountEur ?? 0);
    const pct = p.vatRate != null ? Number(p.vatRate) : p.method === "cash" ? 0 : 21;
    const ex = Math.round((bedrag / (1 + pct / 100)) * 100) / 100;
    /**
     * De verrekenregel krijgt HET TARIEF VAN HET VOORSCHOT ZELF, niet standaard
     * 21%. Dat is het hele punt:
     *
     *  - Zat er btw op het voorschot (er was een anticipo-factuur), dan is die
     *    btw al afgedragen. De regel gaat er mét 21% af en verlaagt dus ook de
     *    btw op deze eindfactuur — anders zou je twee keer btw afdragen.
     *  - Zat er GEEN btw op (kale aanbetaling, contant), dan is over dat deel
     *    nog nooit btw afgedragen. De regel gaat er dan met 0% af: het bedrag
     *    daalt wél, maar de btw-grondslag blijft het volle werk. Zou je dit
     *    tegen 21% aftrekken, dan verdween er btw die de Hacienda gewoon nog
     *    tegoed heeft — bij Silvestre € 21.000.
     */
    items.push({
      name: `Verrekening ${p.description ?? "voorschot"}`,
      description: `${p.date ? `ontvangen ${new Date(p.date).toLocaleDateString("nl-NL")}` : "datum onbekend"}${
        pct === 0 ? " · zonder btw ontvangen, btw wordt hier alsnog afgerekend" : ` · inclusief ${pct}% btw`
      }`,
      units: 1,
      price: -ex,
      taxRate: pct,
      category: "materiaal",
    });
  }
  if (items.length === 0) redirect(`/projects/${projectId}?eind=niets`);

  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const { id } = await insertNumberedDocument("invoice", {
    kind: "invoice",
    status: "draft",
    title: `Eindafrekening ${project.name}`,
    contactId: project.contactId,
    projectId,
    propertyId: project.propertyId,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    subtotalEur: round2(totals.subtotal),
    taxEur: round2(totals.tax),
    totalEur: round2(totals.total),
    items,
  });

  await db.insert(activities).values({
    type: "note",
    subject: `Eindafrekening opgesteld: ${project.name}`,
    body: `Aanneemsom ${formatEUR(doel)} minus ${formatEUR(gefactureerd)} reeds gefactureerd en ${ontvangsten.length} voorschot(ten). Staat als concept klaar.`,
    contactId: project.contactId ?? null,
    authorId: user.id,
  });

  revalidatePath(`/projects/${projectId}`);
  redirect(`/documents/${id}/edit`);
}

/* --------------------------------------------- producten leveren op een project */

/**
 * Boekt één of meer producten op het project: voorraad eraf, kost- én
 * verkoopprijs vastgelegd.
 *
 * Het formulier stuurt genummerde velden (`productId_0`, `qty_0`, …) omdat je er
 * regels bij kunt zetten. Een regel die niet lukt — meestal te weinig voorraad —
 * houdt de rest niet tegen; wat er misging komt terug in de melding.
 */
export async function deliverToProject(projectId: string, formData: FormData) {
  const user = await requireUser();
  const { deliverProductToProject } = await import("@/lib/project-delivery");
  const datum = String(formData.get("date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const notitie = String(formData.get("note") ?? "");

  // Alle regelnummers uit het formulier vissen; de nummering loopt niet netjes
  // door als je er tussenuit hebt gehaald.
  const nummers = [...new Set(
    [...formData.keys()].map((k) => k.match(/^productId_(\d+)$/)?.[1]).filter((n): n is string => !!n),
  )];

  let geboekt = 0;
  let teBestellen = 0;
  const mislukt: string[] = [];
  for (const n of nummers) {
    const productId = String(formData.get(`productId_${n}`) ?? "").trim();
    const qty = Number(moneyOrNull(String(formData.get(`qty_${n}`) ?? "")) ?? 0);
    if (!productId || !(qty > 0)) continue; // lege regel, gewoon overslaan
    const prijs = formData.get(`price_${n}`);
    const res = await deliverProductToProject({
      projectId,
      productId,
      qty,
      unitPriceEur: prijs ? Number(moneyOrNull(String(prijs))) : null,
      date: datum,
      note: notitie,
      userId: user.id,
    });
    if (res.ok) {
      geboekt++;
      if (res.teBestellen > 0) teBestellen += res.teBestellen;
    } else {
      mislukt.push(res.reason);
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/products");
  const melding = mislukt.length
    ? `deels:${geboekt}:${encodeURIComponent(mislukt.join(", "))}`
    : geboekt > 0
      ? // Wat er niet op voorraad lag komt op de bestellijst; dat is geen fout
        // maar wel iets wat iemand moet zien.
        `ok:${geboekt}${teBestellen > 0 ? `:${teBestellen}` : ""}`
      : "leeg";
  redirect(`/projects/${projectId}?lev=${melding}#leveringen`);
}

/** Draait een levering terug: voorraad weer erbij. */
export async function reverseDelivery(projectId: string, deliveryId: string) {
  const user = await requireUser();
  const { reverseProjectDelivery } = await import("@/lib/project-delivery");
  await reverseProjectDelivery({ id: deliveryId, userId: user.id });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/products");
}

/* ------------------------------------------------------------------ meerwerk */

const extraSchema = z.object({
  description: z.string().trim().min(1, "Omschrijving is verplicht"),
  amountEur: z.string().trim().min(1, "Bedrag is verplicht"),
  costEur: z.string().trim().optional(),
  date: z.string().trim().optional(),
  approved: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/** Meerwerk vastleggen: komt bovenop de aanneemsom, dus op de eindafrekening erbij. */
export async function addProjectExtra(projectId: string, formData: FormData) {
  const user = await requireUser();
  const parsed = extraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db.insert(projectExtras).values({
    projectId,
    description: d.description,
    amountEur: numOrZero(d.amountEur),
    costEur: moneyOrNull(d.costEur),
    date: dateOrNull(d.date) ?? new Date().toISOString().slice(0, 10),
    // Akkoord van de klant vastleggen zodra het er is; zonder akkoord is
    // meerwerk aan het eind van een klus een discussie.
    approvedAt: d.approved === "on" ? new Date() : null,
    note: d.note || null,
    createdBy: user.id,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleProjectExtraApproved(projectId: string, extraId: string, akkoord: boolean) {
  await requireUser();
  await db
    .update(projectExtras)
    .set({ approvedAt: akkoord ? new Date() : null, updatedAt: new Date() })
    .where(eq(projectExtras.id, extraId));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteProjectExtra(projectId: string, extraId: string) {
  await requireUser();
  await db.delete(projectExtras).where(eq(projectExtras.id, extraId));
  revalidatePath(`/projects/${projectId}`);
}
