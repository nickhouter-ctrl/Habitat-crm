/**
 * Holded ⇄ Habitat CRM sync helpers.
 *
 * Direction & conflict policy (current): Holded is treated as the source of
 * truth for **contacts** and **financial documents** — we *pull* and mirror
 * them locally. Pushing local changes back to Holded is stubbed (`pushContactToHolded`)
 * and the per-field source-of-truth rules are still TBD.
 *
 * Every mirrored record's mapping lives in the `holded_sync_map` table — we
 * never overload primary keys with external ids.
 */
import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  contacts,
  documents,
  holdedSyncMap,
  products,
  purchaseOrders,
  type DocumentLineItem,
  type PurchaseOrderLineItem,
} from "@/lib/db/schema";

import { holded, holdedListAll } from "./client";
import type {
  HoldedContact,
  HoldedDocType,
  HoldedDocument,
  HoldedProduct,
  HoldedWebhookPayload,
} from "./types";

/* --------------------------------------------------------------- mappings */

type LocalContactType =
  | "lead"
  | "customer"
  | "owner"
  | "partner"
  | "supplier"
  | "other";

const HOLDED_TYPE_TO_LOCAL: Record<string, LocalContactType> = {
  client: "customer",
  debtor: "customer",
  supplier: "supplier",
  creditor: "supplier",
  lead: "lead",
};

const LOCAL_TYPE_TO_HOLDED: Record<LocalContactType, string> = {
  customer: "client",
  lead: "lead",
  supplier: "supplier",
  owner: "client",
  partner: "client",
  other: "client",
};

export function mapHoldedContactToLocal(
  c: HoldedContact,
): Partial<typeof contacts.$inferInsert> {
  const addr = c.billAddress ?? c.shipAddress;
  return {
    name: c.name?.trim() || c.tradeName?.trim() || c.email || "(naamloos)",
    email: c.email ?? null,
    phone: c.phone ?? null,
    mobile: c.mobile ?? null,
    type: HOLDED_TYPE_TO_LOCAL[c.type ?? ""] ?? "customer",
    source: "holded",
    addressLine: addr?.address ?? null,
    city: addr?.city ?? null,
    postalCode: addr?.postalCode ?? null,
    province: addr?.province ?? null,
    country: addr?.countryCode ?? addr?.country ?? null,
    notes: c.notes ?? null,
    tags: c.tags && c.tags.length ? c.tags : null,
  };
}

export function mapLocalContactToHolded(
  c: typeof contacts.$inferSelect,
): Partial<HoldedContact> {
  return {
    name: c.name,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    mobile: c.mobile ?? undefined,
    type: LOCAL_TYPE_TO_HOLDED[c.type as LocalContactType] ?? "client",
    isperson: !c.companyId,
    billAddress: {
      address: c.addressLine ?? undefined,
      city: c.city ?? undefined,
      postalCode: c.postalCode ?? undefined,
      province: c.province ?? undefined,
      country: c.country ?? undefined,
    },
    notes: c.notes ?? undefined,
    tags: c.tags ?? undefined,
  };
}

type LocalDocKind =
  | "estimate"
  | "proforma"
  | "invoice"
  | "creditnote"
  | "salesreceipt";

/**
 * Map a Holded `docType` to our local document kind (used by the webhook handler).
 * `purchase` is handled separately (→ purchase_orders), so map it to invoice as a fallback.
 */
export const HOLDED_DOCTYPE_TO_KIND: Record<HoldedDocType, LocalDocKind> = {
  estimate: "estimate",
  proform: "proforma",
  invoice: "invoice",
  creditnote: "creditnote",
  salesreceipt: "salesreceipt",
  salesorder: "estimate",
  purchase: "invoice",
};

const KIND_TO_HOLDED_DOCTYPE: Record<LocalDocKind, HoldedDocType> = {
  estimate: "estimate",
  proforma: "proform",
  invoice: "invoice",
  creditnote: "creditnote",
  salesreceipt: "salesreceipt",
};

type LocalDocStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "rejected"
  | "paid"
  | "partially_paid"
  | "overdue"
  | "void";

function holdedDocStatus(d: HoldedDocument): LocalDocStatus {
  // Holded encodes payment status as a small int; 1 = paid, 2 = partially paid.
  if (d.status === 1) return "paid";
  if (d.status === 2) return "partially_paid";
  if ((d.paymentsTotal ?? 0) > 0) return "partially_paid";
  return "sent";
}

function unixToDateString(seconds?: number): string | null {
  if (!seconds) return null;
  const ms = seconds < 1e12 ? seconds * 1000 : seconds;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function mapHoldedDocumentToLocal(
  d: HoldedDocument,
  kind: LocalDocKind,
): Partial<typeof documents.$inferInsert> {
  const items: DocumentLineItem[] = (d.products ?? []).map((p) => ({
    name: p.name ?? "",
    description: p.desc,
    units: p.units ?? 1,
    price: p.price ?? 0,
    discount: typeof p.discount === "number" && p.discount > 0 ? p.discount : undefined,
    taxRate: p.tax,
  }));
  return {
    kind,
    docNumber: d.docNumber ?? null,
    status: holdedDocStatus(d),
    title: d.desc ?? null,
    issueDate: unixToDateString(d.date),
    dueDate: unixToDateString(d.dueDate),
    currency: d.currency?.toUpperCase() || "EUR",
    subtotalEur: String(d.subtotal ?? 0),
    taxEur: String(d.tax ?? 0),
    totalEur: String(d.total ?? 0),
    paidEur: String(d.paymentsTotal ?? 0),
    items,
    notes: d.notes ?? null,
    holdedId: d.id,
  };
}

/* ----------------------------------------------------------- sync-map utils */

type SyncEntity = "contact" | "company" | "document";
type SyncDir = "pull" | "push";

function hashPayload(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export async function getLocalIdForHolded(
  entityType: SyncEntity,
  holdedId: string,
): Promise<string | null> {
  const row = await db.query.holdedSyncMap.findFirst({
    where: and(
      eq(holdedSyncMap.entityType, entityType),
      eq(holdedSyncMap.holdedId, holdedId),
    ),
  });
  return row?.localId ?? null;
}

export async function getHoldedIdForLocal(
  entityType: SyncEntity,
  localId: string,
): Promise<string | null> {
  const row = await db.query.holdedSyncMap.findFirst({
    where: and(
      eq(holdedSyncMap.entityType, entityType),
      eq(holdedSyncMap.localId, localId),
    ),
  });
  return row?.holdedId ?? null;
}

export async function upsertSyncMap(args: {
  entityType: SyncEntity;
  localId: string;
  holdedId: string;
  direction: SyncDir;
  holdedUpdatedAt?: Date | null;
  payload?: unknown;
}): Promise<void> {
  const now = new Date();
  const payloadHash = args.payload === undefined ? undefined : hashPayload(args.payload);
  await db
    .insert(holdedSyncMap)
    .values({
      entityType: args.entityType,
      localId: args.localId,
      holdedId: args.holdedId,
      lastSyncedAt: now,
      lastSyncDirection: args.direction,
      holdedUpdatedAt: args.holdedUpdatedAt ?? null,
      payloadHash: payloadHash ?? null,
    })
    .onConflictDoUpdate({
      target: [holdedSyncMap.entityType, holdedSyncMap.localId],
      set: {
        holdedId: args.holdedId,
        lastSyncedAt: now,
        lastSyncDirection: args.direction,
        ...(args.holdedUpdatedAt !== undefined
          ? { holdedUpdatedAt: args.holdedUpdatedAt }
          : {}),
        ...(payloadHash !== undefined ? { payloadHash } : {}),
        updatedAt: now,
      },
    });
}

/* --------------------------------------------------------- pull operations */

export interface PullResult {
  created: number;
  updated: number;
  total: number;
}

/** Pull all contacts from Holded into our `contacts` table. */
export async function pullContactsFromHolded(): Promise<PullResult> {
  const remote = await holded.contacts.list();
  let created = 0;
  let updated = 0;

  // N+1 on the sync map for now — fine at Habitat's scale; batch later if needed.
  for (const rc of remote) {
    const data = mapHoldedContactToLocal(rc);
    const existingLocalId = await getLocalIdForHolded("contact", rc.id);
    if (existingLocalId) {
      await db.update(contacts).set(data).where(eq(contacts.id, existingLocalId));
      await upsertSyncMap({
        entityType: "contact",
        localId: existingLocalId,
        holdedId: rc.id,
        direction: "pull",
        holdedUpdatedAt: rc.updatedAt ? new Date(rc.updatedAt * 1000) : null,
        payload: rc,
      });
      updated++;
    } else {
      const [row] = await db
        .insert(contacts)
        .values({ ...data, name: data.name ?? "(naamloos)" })
        .returning({ id: contacts.id });
      await upsertSyncMap({
        entityType: "contact",
        localId: row.id,
        holdedId: rc.id,
        direction: "pull",
        holdedUpdatedAt: rc.updatedAt ? new Date(rc.updatedAt * 1000) : null,
        payload: rc,
      });
      created++;
    }
  }

  return { created, updated, total: remote.length };
}

/** Pull financial documents (estimates/invoices/…) from Holded. */
export async function pullDocumentsFromHolded(
  kinds: LocalDocKind[] = ["estimate", "invoice"],
): Promise<PullResult> {
  let created = 0;
  let updated = 0;
  let total = 0;

  for (const kind of kinds) {
    const docType = KIND_TO_HOLDED_DOCTYPE[kind];
    const remote = await holded.documents.list(docType);
    total += remote.length;

    for (const rd of remote) {
      const data = mapHoldedDocumentToLocal(rd, kind);
      // Link to a local contact if we already mirrored it.
      const contactId = rd.contact
        ? await getLocalIdForHolded("contact", rd.contact)
        : null;

      const existing = await db.query.documents.findFirst({
        where: eq(documents.holdedId, rd.id),
      });

      if (existing) {
        await db
          .update(documents)
          .set({ ...data, contactId: contactId ?? existing.contactId })
          .where(eq(documents.id, existing.id));
        await upsertSyncMap({
          entityType: "document",
          localId: existing.id,
          holdedId: rd.id,
          direction: "pull",
          payload: rd,
        });
        updated++;
      } else {
        const [row] = await db
          .insert(documents)
          .values({ ...data, kind, contactId })
          .returning({ id: documents.id });
        await upsertSyncMap({
          entityType: "document",
          localId: row.id,
          holdedId: rd.id,
          direction: "pull",
          payload: rd,
        });
        created++;
      }
    }
  }

  return { created, updated, total };
}

/* ----------------------------------------------- purchases / aankopen (pull) */

/**
 * Pull Holded purchase documents ("aankopen" — purchase invoices) into the
 * `purchase_orders` table so the CRM's Inkooporders match Holded. These are
 * already-invoiced purchases, so we don't touch stock.
 */
export async function pullPurchaseOrdersFromHolded(): Promise<PullResult> {
  const remote = await holded.documents.list("purchase");
  let created = 0;
  let updated = 0;

  for (const d of remote) {
    const items: PurchaseOrderLineItem[] = (d.products ?? []).map((p) => ({
      name: p.name ?? "(naamloos)",
      sku: p.sku && String(p.sku).trim() ? String(p.sku).trim() : undefined,
      units: p.units ?? 1,
      unitPrice: p.price ?? 0,
      note: p.desc && String(p.desc).trim() ? String(p.desc).trim() : undefined,
    }));
    const data = {
      supplier: d.contactName?.trim() || "Onbekende leverancier",
      reference: d.docNumber?.trim() || null,
      status: "received" as const,
      currency: d.currency?.toUpperCase() || "EUR",
      orderDate: unixToDateString(d.date),
      total: String(d.total ?? 0),
      items,
      notes: [d.desc, d.notes].map((s) => s?.trim()).filter(Boolean).join(" — ") || null,
      // These are invoices, not inbound stock — mark stock as "handled" so we never add it.
      stockAppliedAt: new Date(),
      receivedAt: unixToDateString(d.date) ? new Date(unixToDateString(d.date)!) : new Date(),
      holdedId: d.id,
    };

    const existing = await db.query.purchaseOrders.findFirst({
      where: eq(purchaseOrders.holdedId, d.id),
    });
    if (existing) {
      await db.update(purchaseOrders).set(data).where(eq(purchaseOrders.id, existing.id));
      updated++;
    } else {
      await db.insert(purchaseOrders).values(data);
      created++;
    }
  }
  return { created, updated, total: remote.length };
}

/* --------------------------------------------------------- products (pull) */

function vatFromTaxes(taxes: string[] | undefined): number {
  const code = taxes?.find((t) => /iva/i.test(t)) ?? taxes?.[0];
  const m = code?.match(/(\d+)/);
  return m ? Number(m[1]) : 21;
}

/** Coerce a possibly-string/empty Holded numeric to a clean decimal string, or null. */
function numOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : null;
}

/** Normalise a product name for fuzzy matching (lowercase, drop accents/dashes, collapse spaces). */
function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the Holded product catalogue into the CRM `products` table. Holded is the
 * source of truth for products / stock / prices / barcodes; the CRM keeps its own
 * categorisation (collection/category) and image URL, which it inherits by name
 * from the earlier website import where possible.
 */
export async function pullProductsFromHolded(): Promise<PullResult> {
  const remote = await holdedListAll((page) => holded.products.list({ page }));

  const existing = await db.query.products.findMany({
    columns: {
      id: true,
      name: true,
      holdedProductId: true,
      barcode: true,
      collection: true,
      category: true,
      subcategory: true,
      imageUrl: true,
      unit: true,
      // Cost data is maintained CRM-side (from the supplier spreadsheets) —
      // Holded's cost/purchasePrice fields are unreliable, so never clobber.
      costEur: true,
      purchaseCostEur: true,
      otherCostEur: true,
      freightCostEur: true,
      transportCostEur: true,
      dutyPct: true,
    },
  });
  const byHoldedId = new Map(
    existing.filter((p) => p.holdedProductId).map((p) => [p.holdedProductId!, p]),
  );
  const byBarcode = new Map(
    existing.filter((p) => p.barcode).map((p) => [p.barcode!, p]),
  );
  const byName = new Map<string, (typeof existing)[number]>();
  for (const p of existing) {
    const k = normName(p.name);
    if (!byName.has(k)) byName.set(k, p);
  }

  let created = 0;
  let updated = 0;
  for (const rp of remote as HoldedProduct[]) {
    const inherit = byName.get(normName(rp.name));
    const base = {
      name: rp.name,
      sku: rp.sku?.trim() || null,
      barcode: rp.barcode?.trim() || null,
      priceEur: numOrNull(rp.price),
      vatRate: vatFromTaxes(rp.taxes),
      costEur: numOrNull(rp.cost),
      purchaseCostEur: numOrNull(rp.purchasePrice),
      stockQty: rp.hasStock ? numOrNull(rp.stock) : null,
      description: rp.desc?.trim() || null,
      holdedProductId: rp.id,
      isActive: rp.forSale !== false,
    };
    const match =
      byHoldedId.get(rp.id) ??
      (rp.barcode ? byBarcode.get(rp.barcode.trim()) : undefined) ??
      byName.get(normName(rp.name));

    if (match && (!match.holdedProductId || match.holdedProductId === rp.id)) {
      await db
        .update(products)
        .set({
          ...base,
          // CRM-side cost data wins; Holded only fills the blanks.
          costEur: match.costEur ?? base.costEur,
          purchaseCostEur: match.purchaseCostEur ?? base.purchaseCostEur,
          otherCostEur: match.otherCostEur,
          freightCostEur: match.freightCostEur,
          transportCostEur: match.transportCostEur,
          dutyPct: match.dutyPct,
          unit: match.unit,
          collection: match.collection ?? inherit?.collection ?? null,
          category: match.category ?? inherit?.category ?? null,
          subcategory: match.subcategory ?? inherit?.subcategory ?? null,
          imageUrl: match.imageUrl ?? inherit?.imageUrl ?? null,
        })
        .where(eq(products.id, match.id));
      match.holdedProductId = rp.id; // claim it for the rest of this run
      updated++;
    } else {
      await db.insert(products).values({
        ...base,
        collection: inherit?.collection ?? null,
        category: inherit?.category ?? null,
        subcategory: inherit?.subcategory ?? null,
        imageUrl: inherit?.imageUrl ?? null,
      });
      created++;
    }
  }
  return { created, updated, total: remote.length };
}

/* ---------------------------------------------------------- push (stubbed) */

/**
 * Create or update the Holded contact for a local contact.
 * TODO: decide per-field source of truth before enabling this in the UI.
 */
export async function pushContactToHolded(
  contactId: string,
): Promise<{ holdedId: string }> {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, contactId),
  });
  if (!contact) throw new Error(`Contact ${contactId} not found`);

  const body = mapLocalContactToHolded(contact);
  const existingHoldedId = await getHoldedIdForLocal("contact", contactId);

  let holdedId: string;
  if (existingHoldedId) {
    await holded.contacts.update(existingHoldedId, body);
    holdedId = existingHoldedId;
  } else {
    const res = await holded.contacts.create(body);
    if (!res.id) throw new Error("Holded did not return a contact id");
    holdedId = res.id;
  }

  await upsertSyncMap({
    entityType: "contact",
    localId: contactId,
    holdedId,
    direction: "push",
    payload: body,
  });
  return { holdedId };
}

/* ------------------------------------------------------------- webhooks */

/**
 * Handle an inbound Holded webhook. Holded's payloads are sparsely documented;
 * we react on the event name and re-pull the affected resource type. The raw
 * event is already persisted by the route handler in `webhook_events`.
 */
export async function handleHoldedWebhook(
  payload: HoldedWebhookPayload | null,
): Promise<void> {
  if (!payload) return;
  const name = String(payload.name ?? payload.event ?? "").toLowerCase();
  if (!name) return;

  if (name.includes("product") || name.includes("stock") || name.includes("warehouse")) {
    await pullProductsFromHolded();
    return;
  }
  if (name.includes("contact")) {
    await pullContactsFromHolded();
    return;
  }
  if (
    name.includes("invoice") ||
    name.includes("estimate") ||
    name.includes("document") ||
    name.includes("creditnote") ||
    name.includes("salesreceipt")
  ) {
    await pullDocumentsFromHolded();
    return;
  }
  // Unknown event — already logged; nothing to do.
}
