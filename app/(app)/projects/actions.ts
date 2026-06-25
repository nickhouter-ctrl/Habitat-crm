"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  documents,
  projectBudgetLines,
  projectCosts,
  projectPayments,
  projectPhases,
  projects,
  purchaseOrders,
  timeEntries,
  workers,
  type DocumentLineItem,
  type DocumentPhase,
} from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { renderBudgetPdf } from "@/lib/budget-pdf";
import { sendEmail } from "@/lib/email";
import { COMPANY } from "@/lib/company";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

/** Bedrag-string normaliseren (NL-komma → punt); leeg → null. */
function moneyOrNull(v?: string): string | null {
  const s = (v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : null;
}
function numOrZero(v?: string): string {
  return moneyOrNull(v) ?? "0";
}

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
  contactId: z.string().trim().optional(),
  ownerId: z.string().trim().optional(),
  propertyId: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
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
      contactId: uuidOrNull(d.contactId),
      ownerId: uuidOrNull(d.ownerId),
      propertyId: uuidOrNull(d.propertyId),
      startDate: dateOrNull(d.startDate),
      endDate: dateOrNull(d.endDate),
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
  paymentMethod: z.enum(["cash", "invoice"]).default("cash"),
  note: z.string().trim().optional(),
});

export async function addTimeEntry(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = timeEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const workerId = uuidOrNull(d.workerId);
  // Tarief: expliciet ingevuld wint; anders het kostentarief van de gekozen arbeider.
  let rate = moneyOrNull(d.hourlyCostEur);
  let workerName: string | null = null;
  if (workerId) {
    const w = await db.query.workers.findFirst({ where: eq(workers.id, workerId) });
    workerName = w?.name ?? null;
    if (rate == null) rate = w?.hourlyCostEur != null ? String(w.hourlyCostEur) : null;
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

export async function deleteTimeEntry(projectId: string, entryId: string) {
  await requireUser();
  await db.delete(timeEntries).where(eq(timeEntries.id, entryId));
  revalidatePath(`/projects/${projectId}`);
}

/* ------------------------------------------------ losse projectkosten (inkoop) */

const costSchema = z.object({
  date: z.string().trim().min(1, "Datum is verplicht"),
  category: z.enum(["material", "subcontractor", "equipment", "other"]).default("material"),
  description: z.string().trim().min(1, "Omschrijving is verplicht"),
  supplier: z.string().trim().optional(),
  amountEur: z.string().trim().optional(),
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
});

export async function addProjectPayment(projectId: string, formData: FormData) {
  await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  await db.insert(projectPayments).values({
    projectId,
    date: dateOrNull(d.date),
    amountEur: numOrZero(d.amountEur),
    method: d.method,
    description: d.description || null,
    note: d.note || null,
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
  });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/documents/${id}/edit`);
}
