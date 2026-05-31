"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, contacts, deals, documents, holdedSyncMap, products } from "@/lib/db/schema";
import { syncDealFromDocument } from "@/lib/deals";
import {
  computeTotals,
  parseLineItems,
  suggestDocNumber,
  type DocKind,
} from "@/lib/documents";
import { offerteEmail, sendEmail } from "@/lib/email";
import { renderDocumentPdf } from "@/lib/document-pdf";

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
  projectId: optionalUuid,
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
      projectId: v.projectId || null,
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

/** Bezorgafstand (km) van de showroom naar het adres van het contact (OpenRouteService). */
export async function deliveryDistanceKm(contactId: string): Promise<number | null> {
  if (!contactId) return null;
  const key = process.env.ORS_API_KEY;
  if (!key) return null;
  const c = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
    columns: { addressLine: true, postalCode: true, city: true, province: true, country: true },
  });
  if (!c || (!c.addressLine && !c.city && !c.postalCode)) return null;
  const addr = [
    c.addressLine,
    [c.postalCode, c.city].filter(Boolean).join(" "),
    c.province,
    c.country ?? "Spain",
  ]
    .filter((p) => p && p.trim())
    .join(", ");
  // Showroom Camí de la Fontana 3, Jávea — vast vertrekpunt (lng,lat).
  const SHOWROOM = "0.150464,38.785694";
  try {
    const g = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${key}&size=1&text=${encodeURIComponent(addr)}`,
      { cache: "no-store" },
    );
    const gj = await g.json();
    const dest = gj?.features?.[0]?.geometry?.coordinates as [number, number] | undefined;
    if (!dest) return null;
    const r = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${key}&start=${SHOWROOM}&end=${dest[0]},${dest[1]}`,
      { cache: "no-store" },
    );
    const rj = await r.json();
    const meters = rj?.features?.[0]?.properties?.summary?.distance;
    if (typeof meters !== "number") return null;
    return Math.round((meters / 1000) * 10) / 10;
  } catch (err) {
    console.warn("[habitat-crm] bezorgafstand mislukt:", err);
    return null;
  }
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

  // Optional: spin off a pakbon meteen, met dezelfde regels.
  const alsoDelivery = String(raw.alsoDeliveryNote ?? "") === "1";
  let deliveryId: string | null = null;
  if (alsoDelivery && (kind === "invoice" || kind === "estimate")) {
    deliveryId = await createDeliveryNoteInternal(row.id);
  }

  revalidateAround(kind);
  redirect(deliveryId ? `/documents/${row.id}?pakbon=${deliveryId}` : `/documents/${row.id}`);
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
      projectId: values.projectId,
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
    columns: { kind: true, status: true },
  });
  if (!doc) redirect("/quotes");
  // Veilig verwijderen: offertes mogen altijd weg; facturen e.d. alleen zolang
  // ze nog concept zijn. Verstuurde/betaalde facturen blijven beschermd.
  const deletable = doc.kind === "estimate" || doc.status === "draft";
  if (!deletable) {
    redirect(`/documents/${id}?verwijderen=beschermd`);
  }
  // Holded-koppeling opruimen zodat het document niet terug-synct.
  await db
    .delete(holdedSyncMap)
    .where(and(eq(holdedSyncMap.entityType, "document"), eq(holdedSyncMap.localId, id)));
  await db.delete(documents).where(eq(documents.id, id));
  revalidateAround(doc.kind as DocKind);
  redirect(listPathFor(doc.kind as DocKind));
}

/** Mark a document as sent, generate (or reuse) the public accept link, e-mail the client. */
export async function sendDocument(id: string) {
  const user = await requireUser();
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: {
        columns: {
          email: true,
          name: true,
          preferredLanguage: true,
          addressLine: true,
          postalCode: true,
          city: true,
        },
      },
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
    // Genereer de PDF en stuur 'm als bijlage mee (i.p.v. alleen een link).
    let attachments:
      | { filename: string; content: Uint8Array; contentType: string }[]
      | undefined;
    try {
      const addr =
        [
          doc.contact.addressLine,
          [doc.contact.postalCode, doc.contact.city].filter(Boolean).join(" "),
        ]
          .filter((p) => p && p.trim())
          .join(", ") || null;
      const buf = await renderDocumentPdf({
        kind: doc.kind,
        docNumber: doc.docNumber,
        title: doc.title,
        issueDate: doc.issueDate,
        dueDate: doc.dueDate,
        subtotalEur: doc.subtotalEur,
        taxEur: doc.taxEur,
        totalEur: doc.totalEur,
        items: doc.items ?? [],
        notes: doc.notes,
        contactName: doc.contact.name ?? null,
        contactAddress: addr,
        locale: doc.contact.preferredLanguage ?? "es",
      });
      attachments = [
        {
          filename: `${kindLabel}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`,
          content: new Uint8Array(buf),
          contentType: "application/pdf",
        },
      ];
    } catch (err) {
      console.warn("[habitat-crm] kon PDF niet genereren voor mail:", err);
    }
    const res = await sendEmail({ to: doc.contact.email, ...mail, attachments });
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

/** Versturen vanuit het preview-scherm: aangepast onderwerp/bericht + extra bijlagen. */
export async function sendDocumentCustom(id: string, formData: FormData) {
  const user = await requireUser();
  const doc = await db.query.documents.findFirst({
    where: eq(documents.id, id),
    with: {
      contact: {
        columns: {
          email: true,
          name: true,
          preferredLanguage: true,
          addressLine: true,
          postalCode: true,
          city: true,
        },
      },
    },
  });
  if (!doc) return;

  const to = String(formData.get("to") ?? "").trim() || doc.contact?.email || "";
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const token = doc.acceptToken ?? newToken();
  const url = `${await baseUrl()}/offerte/${token}`;
  const kindLabel = doc.kind === "invoice" ? "Factuur" : "Offerte";

  await db
    .update(documents)
    .set({
      acceptToken: token,
      sentAt: new Date(),
      status: doc.status === "draft" || doc.status === "void" ? "sent" : doc.status,
    })
    .where(eq(documents.id, id));

  let result: "verzonden" | "geenmail" | "geenadres" = "geenadres";
  if (to) {
    const attachments: { filename: string; content: Uint8Array; contentType: string }[] = [];
    try {
      const addr =
        [
          doc.contact?.addressLine,
          [doc.contact?.postalCode, doc.contact?.city].filter(Boolean).join(" "),
        ]
          .filter((p) => p && p.trim())
          .join(", ") || null;
      const buf = await renderDocumentPdf({
        kind: doc.kind,
        docNumber: doc.docNumber,
        title: doc.title,
        issueDate: doc.issueDate,
        dueDate: doc.dueDate,
        subtotalEur: doc.subtotalEur,
        taxEur: doc.taxEur,
        totalEur: doc.totalEur,
        items: doc.items ?? [],
        notes: doc.notes,
        contactName: doc.contact?.name ?? null,
        contactAddress: addr,
        locale: doc.contact?.preferredLanguage ?? "es",
      });
      attachments.push({
        filename: `${kindLabel}-${doc.docNumber ?? doc.id.slice(0, 8)}.pdf`,
        content: new Uint8Array(buf),
        contentType: "application/pdf",
      });
    } catch (err) {
      console.warn("[habitat-crm] kon PDF niet genereren voor mail:", err);
    }
    // Extra bijlagen die in het previewscherm zijn toegevoegd.
    for (const f of formData.getAll("extra")) {
      if (f instanceof File && f.size > 0) {
        attachments.push({
          filename: f.name,
          content: new Uint8Array(await f.arrayBuffer()),
          contentType: f.type || "application/octet-stream",
        });
      }
    }
    const mail = offerteEmail({
      lang: doc.contact?.preferredLanguage,
      kind: doc.kind,
      docNumber: doc.docNumber ?? "",
      title: doc.title,
      contactName: doc.contact?.name,
      url,
      subject: subject || null,
      message: message || null,
    });
    const res = await sendEmail({ to, ...mail, attachments });
    result = res.sent ? "verzonden" : "geenmail";
  }

  await db.insert(activities).values({
    type: "email",
    subject: `${kindLabel} ${doc.docNumber ?? ""} verstuurd`,
    body: `Klant-link: ${url}\nE-mail: ${
      result === "verzonden"
        ? `verzonden naar ${to}`
        : result === "geenmail"
          ? `mislukt of niet ingesteld (${to})`
          : "geen e-mailadres bij het contact"
    }`,
    documentId: id,
    dealId: doc.dealId,
    contactId: doc.contactId,
    authorId: user.id,
  });

  await syncDealFromDocument(doc.dealId, { kind: doc.kind, status: "sent", totalEur: doc.totalEur });
  revalidateAround(doc.kind as DocKind, id);
  redirect(`/documents/${id}?verzonden=${result}`);
}

/** Create a draft invoice copied from an (accepted) estimate. */
export async function createInvoiceFromEstimate(estimateId: string, formData?: FormData) {
  await requireUser();
  const est = await db.query.documents.findFirst({ where: eq(documents.id, estimateId) });
  if (!est) return;

  // Percentage voor termijn-/deelfacturen (bv. 50% aanbetaling). Default 100%.
  const rawPct = Number(formData?.get("percentage") ?? 100);
  const pct = Number.isFinite(rawPct) && rawPct > 0 && rawPct <= 100 ? rawPct : 100;
  const factor = pct / 100;

  const baseItems = est.items ?? [];
  const items =
    pct === 100
      ? baseItems
      : baseItems.map((it) => ({
          ...it,
          price: Math.round(Number(it.price) * factor * 100) / 100,
        }));
  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

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
      title:
        pct === 100
          ? est.title
          : `${est.title ?? "Factuur"} — ${pct}% van ${est.docNumber ?? "offerte"}`,
      contactId: est.contactId,
      companyId: est.companyId,
      dealId: est.dealId,
      propertyId: est.propertyId,
      issueDate: today.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      currency: est.currency,
      subtotalEur: round2(totals.subtotal),
      taxEur: round2(totals.tax),
      totalEur: round2(totals.total),
      items,
      notes: est.notes,
    })
    .returning({ id: documents.id });

  revalidateAround("invoice");
  revalidatePath(`/documents/${estimateId}`);
  redirect(`/documents/${row.id}/edit`);
}

/** Create a draft delivery note (pakbon) copied from another document's lines. */
/** Internal: clone a document as a pakbon and return the new id (no redirect). */
async function createDeliveryNoteInternal(sourceId: string): Promise<string | null> {
  const src = await db.query.documents.findFirst({ where: eq(documents.id, sourceId) });
  if (!src) return null;

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
  return row.id;
}

export async function createDeliveryNoteFromDocument(sourceId: string) {
  await requireUser();
  const id = await createDeliveryNoteInternal(sourceId);
  if (id) redirect(`/documents/${sourceId}?pakbon=${id}`);
}

/**
 * Voorraad **afboeken** voor een pakbon. Idempotent: alleen de eerste keer.
 * Per regel: als er een productId aan hangt, trek de aantallen af van de voorraad.
 */
export async function applyStockOutFromDocument(id: string) {
  const user = await requireUser();
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc) return;
  if (doc.kind !== "deliverynote") throw new Error("Voorraad afboeken kan alleen op een pakbon.");
  if (doc.stockAppliedAt) {
    revalidatePath(`/documents/${id}`);
    return;
  }

  let applied = 0;
  for (const it of doc.items ?? []) {
    if (!it.productId || !it.units) continue;
    // Check of dit product een bundle/kit is — dan componenten aftrekken i.p.v. het set zelf
    const prod = await db.query.products.findFirst({ where: eq(products.id, it.productId) });
    const kit = (prod?.components as Array<{ sku: string; qty: number }> | null) ?? null;
    if (kit && kit.length > 0) {
      for (const comp of kit) {
        const deductQty = Number(it.units) * Number(comp.qty);
        await db
          .update(products)
          .set({
            stockQty: sql`coalesce(${products.stockQty}, 0) - ${String(deductQty)}`,
            updatedAt: new Date(),
          })
          .where(eq(products.sku, comp.sku));
      }
    } else {
      await db
        .update(products)
        .set({
          stockQty: sql`coalesce(${products.stockQty}, 0) - ${String(it.units)}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, it.productId));
    }
    applied++;
  }

  await db
    .update(documents)
    .set({ stockAppliedAt: new Date() })
    .where(eq(documents.id, id));

  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad afgeboekt — pakbon ${doc.docNumber ?? ""}`.trim(),
    body: `${applied} productregel(s) van de voorraad afgehaald.`,
    documentId: id,
    contactId: doc.contactId,
    authorId: user.id,
  });

  revalidatePath(`/documents/${id}`);
  revalidatePath("/products");
  revalidatePath("/pakbonnen");
}

/** Voorraad-afboeken ongedaan maken (bv. pakbon terug-getrokken). */
export async function reverseStockOutFromDocument(id: string) {
  const user = await requireUser();
  const doc = await db.query.documents.findFirst({ where: eq(documents.id, id) });
  if (!doc || !doc.stockAppliedAt) return;

  for (const it of doc.items ?? []) {
    if (!it.productId || !it.units) continue;
    const prod = await db.query.products.findFirst({ where: eq(products.id, it.productId) });
    const kit = (prod?.components as Array<{ sku: string; qty: number }> | null) ?? null;
    if (kit && kit.length > 0) {
      for (const comp of kit) {
        const addQty = Number(it.units) * Number(comp.qty);
        await db
          .update(products)
          .set({
            stockQty: sql`coalesce(${products.stockQty}, 0) + ${String(addQty)}`,
            updatedAt: new Date(),
          })
          .where(eq(products.sku, comp.sku));
      }
    } else {
      await db
        .update(products)
        .set({
          stockQty: sql`coalesce(${products.stockQty}, 0) + ${String(it.units)}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, it.productId));
    }
  }
  await db
    .update(documents)
    .set({ stockAppliedAt: null })
    .where(eq(documents.id, id));
  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad-afboeking teruggedraaid — pakbon ${doc.docNumber ?? ""}`.trim(),
    documentId: id,
    contactId: doc.contactId,
    authorId: user.id,
  });
  revalidatePath(`/documents/${id}`);
  revalidatePath("/products");
}
