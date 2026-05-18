"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { activities, products, purchaseOrders } from "@/lib/db/schema";
import type { PurchaseOrderAttachment, PurchaseOrderLineItem } from "@/lib/db/schema";
import { nextSequentialSku } from "@/lib/products";
import { parsePoLineItems, poTotal, PO_STATUSES } from "@/lib/purchase-orders";
import { deletePurchaseOrderFile } from "@/lib/storage";
import { pushPurchaseOrderToHolded as syncPushToHolded } from "@/lib/holded/sync";

const schema = z.object({
  supplier: z.string().trim().min(1, "Leverancier is verplicht"),
  reference: z.string().trim().optional(),
  status: z.enum(PO_STATUSES).default("ordered"),
  currency: z.string().trim().min(1).max(3).default("EUR"),
  orderDate: z.string().trim().optional(),
  expectedDate: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  items: z.string().optional(),
  attachments: z.string().optional(),
});

function parseAttachments(raw: unknown): PurchaseOrderAttachment[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: PurchaseOrderAttachment[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const path = String(o.path ?? "").trim();
    if (!path) continue;
    out.push({
      name: name || path,
      path,
      size: typeof o.size === "number" ? o.size : undefined,
      uploadedAt: o.uploadedAt ? String(o.uploadedAt) : undefined,
    });
  }
  return out;
}

function dateOrNull(v?: string) {
  return v && v.length ? v : null;
}

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user as { id?: string };
}

export async function createPurchaseOrder(formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const d = parsed.data;
  const items = parsePoLineItems(d.items);
  const attachments = parseAttachments(d.attachments);

  const [row] = await db
    .insert(purchaseOrders)
    .values({
      supplier: d.supplier,
      reference: d.reference || null,
      status: d.status,
      currency: d.currency.toUpperCase(),
      orderDate: dateOrNull(d.orderDate),
      expectedDate: dateOrNull(d.expectedDate),
      notes: d.notes || null,
      items,
      attachments,
      total: String(poTotal(items)),
      receivedAt: d.status === "received" ? new Date() : null,
    })
    .returning({ id: purchaseOrders.id });

  if (d.status === "received") await applyStock(row.id, user.id);

  revalidatePath("/inkooporders");
  revalidatePath("/");
  redirect(`/inkooporders/${row.id}`);
}

export async function updatePurchaseOrder(id: string, formData: FormData) {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const d = parsed.data;
  const items = parsePoLineItems(d.items);
  const attachments = parseAttachments(d.attachments);

  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
  });
  if (!existing) throw new Error("Bestelling niet gevonden");

  // Delete storage files that were removed from the attachment list.
  const keptPaths = new Set(attachments.map((a) => a.path));
  for (const a of existing.attachments ?? []) {
    if (!keptPaths.has(a.path)) await deletePurchaseOrderFile(a.path);
  }

  await db
    .update(purchaseOrders)
    .set({
      supplier: d.supplier,
      reference: d.reference || null,
      status: d.status,
      currency: d.currency.toUpperCase(),
      orderDate: dateOrNull(d.orderDate),
      expectedDate: dateOrNull(d.expectedDate),
      notes: d.notes || null,
      items,
      attachments,
      total: String(poTotal(items)),
      receivedAt:
        d.status === "received" ? existing.receivedAt ?? new Date() : existing.receivedAt,
    })
    .where(eq(purchaseOrders.id, id));

  if (d.status === "received" && !existing.stockAppliedAt) {
    await applyStock(id, user.id);
  }

  revalidatePath("/inkooporders");
  revalidatePath(`/inkooporders/${id}`);
  revalidatePath("/");
  redirect(`/inkooporders/${id}`);
}

export async function setPurchaseOrderStatus(id: string, status: (typeof PO_STATUSES)[number]) {
  const user = await requireUser();
  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
  });
  if (!existing) throw new Error("Bestelling niet gevonden");

  await db
    .update(purchaseOrders)
    .set({
      status,
      receivedAt: status === "received" ? existing.receivedAt ?? new Date() : existing.receivedAt,
    })
    .where(eq(purchaseOrders.id, id));

  if (status === "received" && !existing.stockAppliedAt) {
    await applyStock(id, user.id);
  }

  revalidatePath("/inkooporders");
  revalidatePath(`/inkooporders/${id}`);
  revalidatePath("/");
}

/**
 * Maak deze inkooporder aan in Holded (purchase-document). Slaat de Holded-id
 * op zodat een volgende sync 'm vindt en geen duplicaat maakt.
 */
export async function pushPurchaseOrderToHolded(id: string) {
  await requireUser();
  try {
    await syncPushToHolded(id);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Push naar Holded mislukt.");
  }
  revalidatePath("/inkooporders");
  revalidatePath(`/inkooporders/${id}`);
  revalidatePath("/");
}

/**
 * Push alle inkooporders die nog geen Holded-id hebben in 1 batch.
 * Stopt niet bij fouten — verzamelt resultaten en geeft samenvatting terug.
 */
export async function pushAllPendingToHolded(): Promise<{ pushed: number; failed: number; errors: string[] }> {
  await requireUser();
  const pending = await db
    .select({ id: purchaseOrders.id, supplier: purchaseOrders.supplier, reference: purchaseOrders.reference })
    .from(purchaseOrders)
    .where(sql`${purchaseOrders.holdedId} IS NULL`);

  let pushed = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const p of pending) {
    try {
      await syncPushToHolded(p.id);
      pushed++;
    } catch (e) {
      failed++;
      errors.push(`${p.supplier} ${p.reference ?? ""}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  revalidatePath("/inkooporders");
  revalidatePath("/");
  return { pushed, failed, errors };
}

/**
 * Maak een nieuw product aan op basis van een regel uit deze inkooporder en
 * koppel de regel meteen aan dat product. SKU = volgende oplopende code voor
 * de gegeven prefix (default "MS" — onze Magic Stone-reeks).
 */
export async function createProductFromPoLine(
  poId: string,
  lineIndex: number,
  formData?: FormData,
) {
  await requireUser();
  const prefixArg = formData?.get("prefix");
  const prefix = (typeof prefixArg === "string" && prefixArg.trim()) || "MS";

  const po = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, poId),
  });
  if (!po) throw new Error("Bestelling niet gevonden.");
  const items = (po.items ?? []) as PurchaseOrderLineItem[];
  const line = items[lineIndex];
  if (!line) throw new Error("Regel niet gevonden in deze bestelling.");
  if (line.productId) throw new Error("Deze regel is al aan een product gekoppeld.");

  // Volgende SKU bepalen op basis van bestaande producten met deze prefix.
  const existing = await db
    .select({ sku: products.sku })
    .from(products)
    .where(and(isNotNull(products.sku), ilike(products.sku, `${prefix}%`)));
  const sku = nextSequentialSku(prefix, existing.map((r) => r.sku));

  // Collectie voorinvullen op basis van prefix-conventie.
  const collection = prefix.toUpperCase() === "MS" ? "Wandpanelen" : null;

  const [created] = await db
    .insert(products)
    .values({
      name: line.name || `(nieuw ${sku})`,
      sku,
      collection,
      unit: "stuk",
      costEur: line.unitPrice ? String(line.unitPrice) : null,
      currency: po.currency ?? "EUR",
      isActive: true,
    })
    .returning({ id: products.id });

  // PO-regel terugkoppelen naar het nieuwe product.
  const nextItems = items.map((it, i) =>
    i === lineIndex ? { ...it, productId: created.id, sku } : it,
  );
  await db
    .update(purchaseOrders)
    .set({ items: nextItems, updatedAt: new Date() })
    .where(eq(purchaseOrders.id, poId));

  revalidatePath("/inkooporders");
  revalidatePath(`/inkooporders/${poId}`);
  revalidatePath("/products");
}

export async function deletePurchaseOrder(id: string) {
  await requireUser();
  const existing = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, id),
    columns: { attachments: true },
  });
  for (const a of existing?.attachments ?? []) await deletePurchaseOrderFile(a.path);
  await db.delete(purchaseOrders).where(eq(purchaseOrders.id, id));
  revalidatePath("/inkooporders");
  revalidatePath("/");
  redirect("/inkooporders");
}

/** Add each line's `units` to the linked product's stock; idempotent per PO. */
async function applyStock(poId: string, userId?: string) {
  const po = await db.query.purchaseOrders.findFirst({
    where: eq(purchaseOrders.id, poId),
  });
  if (!po || po.stockAppliedAt) return;

  let applied = 0;
  for (const it of po.items ?? []) {
    if (!it.productId || !it.units) continue;
    const res = await db
      .update(products)
      .set({
        stockQty: sql`coalesce(${products.stockQty}, 0) + ${String(it.units)}`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, it.productId));
    void res;
    applied++;
  }

  await db
    .update(purchaseOrders)
    .set({ stockAppliedAt: new Date() })
    .where(eq(purchaseOrders.id, poId));

  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad bijgewerkt — inkooporder ${po.reference ?? po.supplier}`,
    body: `${applied} productregel(s) toegevoegd aan de voorraad.`,
    authorId: userId ?? null,
  });
}
