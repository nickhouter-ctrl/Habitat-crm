"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contacts, deals, documents } from "@/lib/db/schema";
import { syncDealFromDocument } from "@/lib/deals";
import { computeTotals, parseLineItems, type DocKind } from "@/lib/documents";

const KINDS = ["estimate", "proforma", "invoice", "creditnote", "salesreceipt"] as const;
const STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "paid",
  "partially_paid",
  "overdue",
  "void",
] as const;

const optionalUuid = z.string().uuid().optional().or(z.literal(""));
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));

const docSchema = z.object({
  kind: z.enum(KINDS).default("estimate"),
  status: z.enum(STATUSES).default("draft"),
  docNumber: z.string().trim().max(60).optional().or(z.literal("")),
  title: z.string().trim().max(200).optional().or(z.literal("")),
  contactId: optionalUuid,
  companyId: optionalUuid,
  dealId: optionalUuid,
  propertyId: optionalUuid,
  issueDate: optionalDate,
  dueDate: optionalDate,
  currency: z.string().trim().min(3).max(3).default("EUR"),
  notes: z.string().trim().max(8000).optional().or(z.literal("")),
  items: z.string().optional(),
});

function listPathFor(kind: DocKind): string {
  if (kind === "invoice") return "/invoices";
  if (kind === "estimate") return "/quotes";
  return "/documents";
}

function revalidateAround(kind: DocKind, id?: string) {
  revalidatePath(listPathFor(kind));
  if (id) revalidatePath(`/documents/${id}`);
  revalidatePath("/deals");
  revalidatePath("/");
}

function buildValues(v: z.infer<typeof docSchema>) {
  const items = parseLineItems(v.items);
  const totals = computeTotals(items);
  return {
    values: {
      kind: v.kind,
      status: v.status,
      docNumber: v.docNumber || null,
      title: v.title || null,
      contactId: v.contactId || null,
      companyId: v.companyId || null,
      dealId: v.dealId || null,
      propertyId: v.propertyId || null,
      issueDate: v.issueDate || null,
      dueDate: v.dueDate || null,
      currency: (v.currency || "EUR").toUpperCase(),
      subtotalEur: String(totals.subtotal),
      taxEur: String(totals.tax),
      totalEur: String(totals.total),
      items,
    },
    totals,
  };
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

export async function createDocument(formData: FormData) {
  await requireUser();
  const parsed = docSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const kind = (formData.get("kind") as string) || "estimate";
    redirect(`/documents/new?kind=${kind}&error=validation`);
  }
  const { values } = buildValues(parsed.data);
  const [row] = await db.insert(documents).values(values).returning({ id: documents.id });

  await syncDealFromDocument(values.dealId, values);
  revalidateAround(values.kind as DocKind);
  redirect(`/documents/${row.id}`);
}

/** Wizard flow: resolve/create the client (step 1), then create the document (step 2). */
export async function createDocumentFromWizard(formData: FormData) {
  const user = await requireUser();
  const raw = Object.fromEntries(formData);
  const kindParsed = z.enum(KINDS).safeParse(raw.kind);
  const kind = kindParsed.success ? kindParsed.data : "estimate";

  // Parse the step-2 fields up front (so we can use title/propertyId for an auto-deal).
  const docParsed = docSchema.safeParse({ ...raw, status: "draft" });
  if (!docParsed.success) redirect(`/documents/new?kind=${kind}&error=validation`);
  const { values } = buildValues(docParsed.data);

  // Step 1 — client (and, for a new lead, an auto-created deal)
  let contactId: string;
  let dealId: string | null = values.dealId;
  if (raw.clientMode === "new") {
    const name = String(raw.newClientName ?? "").trim();
    if (!name) redirect(`/documents/new?kind=${kind}&error=client`);
    const language = z.enum(["en", "nl", "es", "de"]).catch("es").parse(raw.newClientLanguage);
    const email = String(raw.newClientEmail ?? "").trim();
    const phone = String(raw.newClientPhone ?? "").trim();
    const [c] = await db
      .insert(contacts)
      .values({
        name,
        email: email || null,
        phone: phone || null,
        type: "lead",
        preferredLanguage: language,
        source: kind === "invoice" ? "factuur" : "offerte",
        ownerId: user.id,
      })
      .returning({ id: contacts.id });
    contactId = c.id;

    if (!dealId) {
      const dealTitle = (values.title ?? "").trim() || `Project — ${name}`;
      const [d] = await db
        .insert(deals)
        .values({
          title: dealTitle,
          type: "renovation",
          stage: "lead",
          contactId,
          propertyId: values.propertyId,
          ownerId: user.id,
        })
        .returning({ id: deals.id });
      dealId = d.id;
    }
  } else {
    const cid = z.string().uuid().safeParse(raw.contactId);
    if (!cid.success) redirect(`/documents/new?kind=${kind}&error=client`);
    contactId = cid.data;
  }

  const [row] = await db
    .insert(documents)
    .values({ ...values, contactId, dealId, status: "draft" })
    .returning({ id: documents.id });

  await syncDealFromDocument(dealId, { kind, status: "draft", totalEur: values.totalEur });
  revalidateAround(kind);
  redirect(`/documents/${row.id}`);
}

export async function updateDocument(id: string, formData: FormData) {
  await requireUser();
  const parsed = docSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/documents/${id}/edit?error=validation`);

  const { values } = buildValues(parsed.data);
  // Don't clobber paidEur on edit.
  await db
    .update(documents)
    .set({
      kind: values.kind,
      status: values.status,
      docNumber: values.docNumber,
      title: values.title,
      contactId: values.contactId,
      companyId: values.companyId,
      dealId: values.dealId,
      propertyId: values.propertyId,
      issueDate: values.issueDate,
      dueDate: values.dueDate,
      currency: values.currency,
      subtotalEur: values.subtotalEur,
      taxEur: values.taxEur,
      totalEur: values.totalEur,
      items: values.items,
    })
    .where(eq(documents.id, id));

  await syncDealFromDocument(values.dealId, values);
  revalidateAround(values.kind as DocKind, id);
  redirect(`/documents/${id}`);
}

export async function setDocumentStatus(id: string, formData: FormData) {
  await requireUser();
  const status = String(formData.get("status") ?? "");
  if (!(STATUSES as readonly string[]).includes(status)) return;

  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { totalEur: true, kind: true, dealId: true },
  });
  if (!doc) return;

  const patch: { status: (typeof STATUSES)[number]; paidEur?: string } = {
    status: status as (typeof STATUSES)[number],
  };
  if (status === "paid") patch.paidEur = doc.totalEur;
  if (status === "draft" || status === "sent" || status === "rejected" || status === "void") {
    patch.paidEur = "0";
  }

  await db.update(documents).set(patch).where(eq(documents.id, id));
  await syncDealFromDocument(doc.dealId, { kind: doc.kind, status, totalEur: doc.totalEur });
  revalidateAround(doc.kind as DocKind, id);
}

export async function deleteDocument(id: string) {
  await requireUser();
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    columns: { kind: true },
  });
  await db.delete(documents).where(eq(documents.id, id));
  if (doc) revalidateAround(doc.kind as DocKind);
  redirect(doc ? listPathFor(doc.kind as DocKind) : "/quotes");
}
