"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { consignments, contacts, products, type DocumentLineItem } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { dealerPrice } from "@/lib/reseller";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
}

function qtyOrNull(v?: string): number | null {
  const s = (v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Markeer een bestaand contact als wederverkoper (type = reseller). */
export async function markAsReseller(formData: FormData) {
  await requireUser();
  const contactId = String(formData.get("contactId") ?? "").trim();
  if (contactId.length !== 36) return;
  await db.update(contacts).set({ type: "reseller", updatedAt: new Date() }).where(eq(contacts.id, contactId));
  revalidatePath("/wederverkopers");
  revalidatePath(`/wederverkopers/${contactId}`);
}

const placeSchema = z.object({
  productId: z.string().trim().min(36),
  qty: z.string().trim().min(1, "Aantal is verplicht"),
  note: z.string().trim().optional(),
});

/** Leg producten in consignatie bij een wederverkoper — haalt het van onze voorraad af. */
export async function placeConsignment(resellerId: string, formData: FormData) {
  await requireUser();
  const parsed = placeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const qty = qtyOrNull(parsed.data.qty);
  if (qty == null || qty <= 0) throw new Error("Aantal moet groter dan 0 zijn.");

  const product = await db.query.products.findFirst({ where: eq(products.id, parsed.data.productId) });
  if (!product) throw new Error("Product niet gevonden.");
  const dp = dealerPrice(product.priceEur, product.dealerPriceEur);

  // Bestaande consignatieregel voor (dealer × product)? Dan ophogen, anders nieuw.
  const existing = await db.query.consignments.findFirst({
    where: and(eq(consignments.resellerId, resellerId), eq(consignments.productId, product.id)),
  });
  if (existing) {
    await db
      .update(consignments)
      .set({ qtyPlaced: sql`${consignments.qtyPlaced} + ${qty}`, notes: parsed.data.note || existing.notes, updatedAt: new Date() })
      .where(eq(consignments.id, existing.id));
  } else {
    await db.insert(consignments).values({
      resellerId,
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      unit: product.unit ?? null,
      dealerPriceEur: dp != null ? String(dp) : null,
      costEur: product.costEur != null ? String(product.costEur) : null,
      qtyPlaced: String(qty),
      qtySold: "0",
      notes: parsed.data.note || null,
    });
  }

  // Echte consignatie: van onze eigen voorraad af.
  await db
    .update(products)
    .set({ stockQty: sql`coalesce(${products.stockQty}, 0) - ${qty}`, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  revalidatePath(`/wederverkopers/${resellerId}`);
  revalidatePath("/wederverkopers");
}

/**
 * Maak een concept-factuur voor de wederverkoper met de producten die nu bij
 * hem in de winkel liggen (consignatie, aantal = geplaatst − verkocht), tegen
 * dealerprijs. Opent meteen de factuur om te controleren/versturen.
 */
export async function createResellerInvoice(resellerId: string) {
  await requireUser();
  const reseller = await db.query.contacts.findFirst({ where: eq(contacts.id, resellerId) });
  if (!reseller) redirect("/wederverkopers");

  const rows = await db.select().from(consignments).where(eq(consignments.resellerId, resellerId));
  // Actuele dealerprijs uit het product (valt terug op de momentopname).
  const prodIds = rows.map((r) => r.productId).filter((x): x is string => !!x);
  const prods = prodIds.length
    ? await db.query.products.findMany({
        where: (p, { inArray: inArr }) => inArr(p.id, prodIds),
        columns: { id: true, priceEur: true, dealerPriceEur: true },
      })
    : [];
  const prodById = new Map(prods.map((p) => [p.id, p]));
  const items: DocumentLineItem[] = rows
    .map((c) => {
      const p = c.productId ? prodById.get(c.productId) : undefined;
      const live = p ? dealerPrice(p.priceEur, p.dealerPriceEur) : null;
      return { row: c, qty: Number(c.qtyPlaced) - Number(c.qtySold), price: live ?? Number(c.dealerPriceEur ?? 0) };
    })
    .filter((x) => x.qty > 0 && x.price > 0)
    .map(({ row, qty, price }) => ({
      name: row.productName,
      description: row.sku ?? undefined,
      units: qty,
      price,
      taxRate: 21,
      category: "materiaal",
      productId: row.productId ?? undefined,
    }));
  if (items.length === 0) redirect(`/wederverkopers/${resellerId}?factuur=leeg`);

  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const { id } = await insertNumberedDocument("invoice", {
    kind: "invoice",
    status: "draft",
    title: `Wederverkoper — ${reseller.name}`,
    contactId: resellerId,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    subtotalEur: round2(totals.subtotal),
    taxEur: round2(totals.tax),
    totalEur: round2(totals.total),
    items,
  });
  redirect(`/documents/${id}/edit`);
}

/** Registreer een verkoop door de dealer (→ onze omzet tegen dealerprijs). */
export async function recordConsignmentSale(resellerId: string, consignmentId: string, formData: FormData) {
  await requireUser();
  const qty = qtyOrNull(String(formData.get("qty") ?? ""));
  if (qty == null || qty <= 0) throw new Error("Aantal moet groter dan 0 zijn.");
  const row = await db.query.consignments.findFirst({ where: eq(consignments.id, consignmentId) });
  if (!row) return;
  const left = Number(row.qtyPlaced) - Number(row.qtySold);
  if (qty > left) throw new Error(`Maar ${left} stuks in de winkel.`);
  await db
    .update(consignments)
    .set({ qtySold: sql`${consignments.qtySold} + ${qty}`, updatedAt: new Date() })
    .where(eq(consignments.id, consignmentId));
  revalidatePath(`/wederverkopers/${resellerId}`);
}

/** Haal onverkochte consignatievoorraad terug (→ terug op onze voorraad). */
export async function returnConsignment(resellerId: string, consignmentId: string, formData: FormData) {
  await requireUser();
  const qty = qtyOrNull(String(formData.get("qty") ?? ""));
  if (qty == null || qty <= 0) throw new Error("Aantal moet groter dan 0 zijn.");
  const row = await db.query.consignments.findFirst({ where: eq(consignments.id, consignmentId) });
  if (!row) return;
  const left = Number(row.qtyPlaced) - Number(row.qtySold);
  if (qty > left) throw new Error(`Maar ${left} stuks in de winkel.`);
  await db
    .update(consignments)
    .set({ qtyPlaced: sql`${consignments.qtyPlaced} - ${qty}`, updatedAt: new Date() })
    .where(eq(consignments.id, consignmentId));
  if (row.productId) {
    await db
      .update(products)
      .set({ stockQty: sql`coalesce(${products.stockQty}, 0) + ${qty}`, updatedAt: new Date() })
      .where(eq(products.id, row.productId));
  }
  revalidatePath(`/wederverkopers/${resellerId}`);
}
