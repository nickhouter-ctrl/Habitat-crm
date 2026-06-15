"use server";

import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, documents, products, type DocumentLineItem } from "@/lib/db/schema";
import { setDeliveryNoteDelivered } from "../documents/actions";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

export type ScannedProduct = {
  id: string;
  sku: string | null;
  name: string;
  stockQty: number;
  imageUrl: string | null;
};

/** Zoek een product op streepjescode (of SKU als terugval). */
export async function findProductByBarcode(code: string): Promise<ScannedProduct | null> {
  await requireUser();
  const c = code.trim();
  if (!c) return null;
  const p = await db.query.products.findFirst({
    where: or(eq(products.barcode, c), eq(products.sku, c)),
    columns: { id: true, sku: true, name: true, stockQty: true, imageUrl: true },
  });
  if (!p) return null;
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    stockQty: Number(p.stockQty ?? 0),
    imageUrl: p.imageUrl ?? null,
  };
}

/** Pas de voorraad aan: erbij (ontvangen), eraf (uitgeven) of zetten (tellen). */
export async function adjustStock(
  productId: string,
  mode: "in" | "out" | "set",
  amount: number,
): Promise<{ ok: boolean; stockQty?: number }> {
  const user = await requireUser();
  const a = Math.abs(Number(amount) || 0);
  if (!productId || a <= 0) return { ok: false };
  const p = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { stockQty: true, sku: true, name: true },
  });
  if (!p) return { ok: false };
  const cur = Number(p.stockQty ?? 0);
  const next = mode === "set" ? a : mode === "in" ? cur + a : cur - a;
  await db.update(products).set({ stockQty: String(next), updatedAt: new Date() }).where(eq(products.id, productId));
  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad via scan — ${p.sku ?? p.name}`,
    body:
      (mode === "set" ? `Geteld op ${a}` : mode === "in" ? `Ontvangen +${a}` : `Uitgegeven −${a}`) +
      ` → nieuwe stand ${next} (was ${cur}).`,
    authorId: user.id,
  });
  revalidatePath("/products");
  revalidatePath("/");
  return { ok: true, stockQty: next };
}

// ── Uitleveren (pick-/controlelijst tegen een openstaande pakbon) ──────────

export type OpenDeliveryNote = {
  id: string;
  number: string | null;
  contact: string | null;
  lineCount: number;
};

/** Openstaande pakbonnen (nog niet afgeleverd, niet vervallen) om uit te leveren. */
export async function listOpenDeliveryNotes(): Promise<OpenDeliveryNote[]> {
  await requireUser();
  const rows = await db.query.documents.findMany({
    where: and(
      eq(documents.kind, "deliverynote"),
      isNull(documents.deliveredAt),
      ne(documents.status, "void"),
    ),
    columns: { id: true, docNumber: true, items: true },
    with: { contact: { columns: { name: true } }, company: { columns: { name: true } } },
    orderBy: [desc(documents.issueDate), desc(documents.createdAt)],
    limit: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.docNumber,
    contact: r.company?.name ?? r.contact?.name ?? null,
    lineCount: Array.isArray(r.items) ? (r.items as DocumentLineItem[]).length : 0,
  }));
}

export type PickLine = {
  /** Stabiele sleutel = regelindex binnen de pakbon. */
  key: number;
  name: string;
  units: number;
  productId: string | null;
  barcode: string | null;
  sku: string | null;
};

export type DeliveryNoteForPicking = {
  id: string;
  number: string | null;
  contact: string | null;
  delivered: boolean;
  lines: PickLine[];
};

/** Eén pakbon met regels + bijbehorende barcodes/SKU's om tegen te scannen. */
export async function getDeliveryNoteForPicking(id: string): Promise<DeliveryNoteForPicking | null> {
  await requireUser();
  const doc = await db.query.documents.findFirst({
    where: and(eq(documents.id, id), eq(documents.kind, "deliverynote")),
    columns: { id: true, docNumber: true, items: true, deliveredAt: true },
    with: { contact: { columns: { name: true } }, company: { columns: { name: true } } },
  });
  if (!doc) return null;

  const items = (Array.isArray(doc.items) ? doc.items : []) as DocumentLineItem[];
  const productIds = [...new Set(items.map((i) => i.productId).filter((x): x is string => !!x))];
  const prods = productIds.length
    ? await db.query.products.findMany({
        where: inArray(products.id, productIds),
        columns: { id: true, barcode: true, sku: true },
      })
    : [];
  const byId = new Map(prods.map((p) => [p.id, p]));

  const lines: PickLine[] = items.map((i, idx) => {
    const p = i.productId ? byId.get(i.productId) : undefined;
    return {
      key: idx,
      name: i.name,
      units: Number(i.units) || 0,
      productId: i.productId ?? null,
      barcode: p?.barcode ?? null,
      sku: p?.sku ?? null,
    };
  });

  return {
    id: doc.id,
    number: doc.docNumber,
    contact: doc.company?.name ?? doc.contact?.name ?? null,
    delivered: !!doc.deliveredAt,
    lines,
  };
}

/** Markeer een pakbon als afgeleverd (propageert naar factuur, project en /leveringen). */
export async function markDeliveryNoteDelivered(id: string): Promise<{ ok: boolean }> {
  await requireUser();
  await setDeliveryNoteDelivered(id, true);
  return { ok: true };
}
