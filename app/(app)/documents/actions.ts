"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, contacts, deals, documents } from "@/lib/db/schema";
import { syncDealFromDocument } from "@/lib/deals";
import {
  computeTotals,
  parseLineItems,
  suggestDocNumber,
  type DocKind,
} from "@/lib/documents";
import { offerteEmail, sendEmail } from "@/lib/email";

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3001";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const KINDS = ["estimate", "proforma", "invoice", "creditnote", "salesreceipt", "deliverynote"] as const;
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
  if (kind === "deliverynote") return "/pakbonnen";
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

/** Mark a document as sent, generate (or reuse) the public accept link, e-mail the client. */
export async function sendDocument(id: string) {
  const user = await requireUser();
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: { columns: { email: true, name: true, preferredLanguage: true } },
    },
  });
  if (!doc) return;

  const token = doc.acceptToken ?? newToken();
  const url = `${await baseUrl()}/offerte/${token}`;
  const kindLabel = doc.kind === "invoice" ? "Factuur" : "Offerte";

  await db
    .update(documents)
    .set({
      acceptToken: token,
      sentAt: new Date(),
      // Don't downgrade a paid invoice etc.
      status: doc.status === "draft" || doc.status === "void" ? "sent" : doc.status,
    })
    .where(eq(documents.id, id));

  let emailNote = doc.contact?.email
    ? `naar ${doc.contact.email}`
    : "geen e-mailadres bij het contact";
  if (doc.contact?.email) {
    const mail = offerteEmail({
      lang: doc.contact.preferredLanguage,
      kind: doc.kind,
      docNumber: doc.docNumber ?? "",
      title: doc.title,
      contactName: doc.contact.name,
      url,
    });
    const res = await sendEmail({ to: doc.contact.email, ...mail });
    if (!res.sent) emailNote += " (mail nog niet ingesteld — link handmatig versturen)";
  }

  await db.insert(activities).values({
    type: "email",
    subject: `${kindLabel} ${doc.docNumber ?? ""} verstuurd`,
    body: `Klant-link: ${url}\nE-mail: ${emailNote}`,
    documentId: id,
    dealId: doc.dealId,
    contactId: doc.contactId,
    authorId: user.id,
  });

  await syncDealFromDocument(doc.dealId, { kind: doc.kind, status: "sent", totalEur: doc.totalEur });
  revalidateAround(doc.kind as DocKind, id);
}

/** Create a draft invoice copied from an (accepted) estimate. */
export async function createInvoiceFromEstimate(estimateId: string) {
  await requireUser();
  const est = await db.query.documents.findFirst({ where: eq(documents.id, estimateId) });
  if (!est) return;

  const [{ n }] = await db.select({ n: count() }).from(documents).where(eq(documents.kind, "invoice"));
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 30);

  const [row] = await db
    .insert(documents)
    .values({
      kind: "invoice",
      status: "draft",
      docNumber: suggestDocNumber("invoice", n),
      title: est.title,
      contactId: est.contactId,
      companyId: est.companyId,
      dealId: est.dealId,
      propertyId: est.propertyId,
      issueDate: today.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      currency: est.currency,
      subtotalEur: est.subtotalEur,
      taxEur: est.taxEur,
      totalEur: est.totalEur,
      items: est.items,
      notes: est.notes,
    })
    .returning({ id: documents.id });

  revalidateAround("invoice");
  revalidatePath(`/documents/${estimateId}`);
  redirect(`/documents/${row.id}/edit`);
}

/** Create a draft delivery note (pakbon) copied from another document's lines. */
export async function createDeliveryNoteFromDocument(sourceId: string) {
  await requireUser();
  const src = await db.query.documents.findFirst({ where: eq(documents.id, sourceId) });
  if (!src) return;

  const [{ n }] = await db
    .select({ n: count() })
    .from(documents)
    .where(eq(documents.kind, "deliverynote"));

  const [row] = await db
    .insert(documents)
    .values({
      kind: "deliverynote",
      status: "draft",
      docNumber: suggestDocNumber("deliverynote", n),
      title: src.title,
      contactId: src.contactId,
      companyId: src.companyId,
      dealId: src.dealId,
      propertyId: src.propertyId,
      issueDate: new Date().toISOString().slice(0, 10),
      currency: src.currency,
      subtotalEur: src.subtotalEur,
      taxEur: src.taxEur,
      totalEur: src.totalEur,
      items: src.items,
      notes: src.notes,
    })
    .returning({ id: documents.id });

  revalidateAround("deliverynote");
  revalidatePath(`/documents/${sourceId}`);
  redirect(`/documents/${row.id}/edit`);
}
