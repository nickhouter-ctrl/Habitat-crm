"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contacts, products, sampleMovements, type DocumentLineItem } from "@/lib/db/schema";
import { computeTotals } from "@/lib/documents";
import { insertNumberedDocument } from "@/lib/doc-number";
import { SAMPLE_DEPOSIT_EUR } from "@/lib/samples";

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

const giveSchema = z.object({
  productId: z.string().trim().min(36),
  recipientId: z.string().trim().optional(),
  recipientName: z.string().trim().optional(),
  qty: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

/** Geef een sample uit (van de sample-voorraad af, €5 borg uitstaand). */
export async function giveSample(formData: FormData) {
  await requireUser();
  const parsed = giveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  const d = parsed.data;
  const qty = qtyOrNull(d.qty) ?? 1;
  if (qty <= 0) throw new Error("Aantal moet groter dan 0 zijn.");

  const product = await db.query.products.findFirst({ where: eq(products.id, d.productId) });
  if (!product) throw new Error("Product niet gevonden.");

  const recipientId = d.recipientId && d.recipientId.length === 36 ? d.recipientId : null;
  let recipientName = d.recipientName?.trim() || null;
  if (recipientId && !recipientName) {
    const c = await db.query.contacts.findFirst({ where: eq(contacts.id, recipientId) });
    recipientName = c?.name ?? null;
  }

  await db.insert(sampleMovements).values({
    productId: product.id,
    productName: product.name,
    sku: product.sku ?? null,
    unit: product.unit ?? null,
    recipientId,
    recipientName,
    qty: String(qty),
    depositEur: String(SAMPLE_DEPOSIT_EUR),
    status: "out",
    date: new Date().toISOString().slice(0, 10),
    note: d.note || null,
  });
  // Van de sample-voorraad af.
  await db
    .update(products)
    .set({ sampleStockQty: sql`coalesce(${products.sampleStockQty}, 0) - ${qty}`, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  revalidatePath("/samples");
}

/** Sample retour → borg terug, sample weer in de voorraad. */
export async function returnSample(movementId: string) {
  await requireUser();
  const m = await db.query.sampleMovements.findFirst({ where: eq(sampleMovements.id, movementId) });
  if (!m || m.status !== "out") return;
  await db.update(sampleMovements).set({ status: "returned", updatedAt: new Date() }).where(eq(sampleMovements.id, movementId));
  if (m.productId) {
    await db
      .update(products)
      .set({ sampleStockQty: sql`coalesce(${products.sampleStockQty}, 0) + ${Number(m.qty)}`, updatedAt: new Date() })
      .where(eq(products.id, m.productId));
  }
  revalidatePath("/samples");
}

/** Sample verkocht → blijft weg, borg is definitief (omzet). */
export async function markSampleSold(movementId: string) {
  await requireUser();
  await db.update(sampleMovements).set({ status: "sold", updatedAt: new Date() }).where(eq(sampleMovements.id, movementId));
  revalidatePath("/samples");
}

/**
 * Maak een concept-factuur voor de uitstaande samples (borg) van één ontvanger.
 * Elke nog-niet-gefactureerde uitgifte wordt een regel à €5 borg; de regels
 * worden aan de factuur gekoppeld (status blijft 'out' — borg blijft terug te
 * betalen bij retour).
 */
export async function createSampleInvoice(recipientId: string) {
  await requireUser();
  if (recipientId.length !== 36) redirect("/samples");
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, recipientId) });
  if (!contact) redirect("/samples");

  const rows = await db.query.sampleMovements.findMany({
    where: (m, { and: andF, eq: eqF, isNull }) =>
      andF(eqF(m.recipientId, recipientId), eqF(m.status, "out"), isNull(m.documentId)),
  });
  if (rows.length === 0) redirect("/samples?factuur=leeg");

  const items: DocumentLineItem[] = rows.map((m) => ({
    name: `Sample (borg) — ${m.productName}`,
    description: m.sku ?? undefined,
    units: Number(m.qty),
    price: Number(m.depositEur),
    taxRate: 21,
    category: "materiaal",
    productId: m.productId ?? undefined,
  }));
  const totals = computeTotals(items);
  const round2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
  const { id } = await insertNumberedDocument("invoice", {
    kind: "invoice",
    status: "draft",
    title: `Samples (borg) — ${contact.name}`,
    contactId: recipientId,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: "EUR",
    subtotalEur: round2(totals.subtotal),
    taxEur: round2(totals.tax),
    totalEur: round2(totals.total),
    items,
  });
  // Koppel de samples aan de factuur (zodat ze niet dubbel gefactureerd worden).
  for (const m of rows) {
    await db.update(sampleMovements).set({ documentId: id, updatedAt: new Date() }).where(eq(sampleMovements.id, m.id));
  }
  revalidatePath("/samples");
  redirect(`/documents/${id}/edit`);
}

/** Sample-voorraad van een product bijvullen. */
export async function addSampleStock(formData: FormData) {
  await requireUser();
  const productId = String(formData.get("productId") ?? "").trim();
  const qty = qtyOrNull(String(formData.get("qty") ?? ""));
  if (productId.length !== 36 || qty == null || qty === 0) return;
  await db
    .update(products)
    .set({ sampleStockQty: sql`coalesce(${products.sampleStockQty}, 0) + ${qty}`, updatedAt: new Date() })
    .where(eq(products.id, productId));
  revalidatePath("/samples");
}
