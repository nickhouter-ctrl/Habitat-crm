"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  documents,
  projectBudgetLines,
  projectCosts,
  projects,
  purchaseOrders,
  timeEntries,
  workers,
} from "@/lib/db/schema";

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
  category: z.enum(["labor", "material", "subcontractor", "equipment", "other"]).default("material"),
  description: z.string().trim().min(1, "Omschrijving is verplicht"),
  quantity: z.string().trim().optional(),
  unitPriceEur: z.string().trim().optional(),
  amountEur: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/** Begroot bedrag: qty×eenheidsprijs indien beide ingevuld, anders het losse bedrag. */
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
    description: d.description,
    quantity: qty,
    unitPriceEur: unit,
    amountEur: budgetAmount(qty, unit, moneyOrNull(d.amountEur)),
    note: d.note || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBudgetLine(projectId: string, lineId: string) {
  await requireUser();
  await db.delete(projectBudgetLines).where(eq(projectBudgetLines.id, lineId));
  revalidatePath(`/projects/${projectId}`);
}
