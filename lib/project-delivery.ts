/**
 * Producten leveren op een project — zonder aparte verkoopfactuur.
 *
 * De producten zitten in de aanneemsom, dus ze gaan niet los naar de klant. Wat
 * er wél moet gebeuren:
 *  - de voorraad eraf (het staat in de villa, niet meer in het magazijn);
 *  - de KOSTPRIJS in de projectkosten, want dat is wat het ons kost;
 *  - de VERKOOPPRIJS in wat we doorbelasten, want daar rekenen we de klant voor.
 *
 * Dat laatste is het punt dat anders wegvalt: boek je zo'n levering als kale
 * kostenpost, dan lijkt het project verlies te maken op producten waar juist
 * marge op zit.
 */
import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, products, projectDeliveries } from "@/lib/db/schema";

export type DeliveryResult =
  | { ok: true; id: string; qty: number; costEur: number; priceEur: number }
  | { ok: false; reason: "geen-product" | "geen-aantal" | "te-weinig-voorraad"; beschikbaar?: number };

/**
 * Boekt `qty` van een product op een project. Trekt de voorraad in één statement
 * af (geen lees-dan-schrijf race) en weigert als er te weinig ligt — negatieve
 * voorraad is altijd een fout, geen feit.
 */
export async function deliverProductToProject(args: {
  projectId: string;
  productId: string;
  qty: number;
  date: string;
  note?: string | null;
  /** Afwijkende verkoopprijs per stuk; leeg = de catalogusprijs van nu. */
  unitPriceEur?: number | null;
  userId: string | null;
}): Promise<DeliveryResult> {
  if (!args.productId) return { ok: false, reason: "geen-product" };
  if (!(args.qty > 0)) return { ok: false, reason: "geen-aantal" };

  const product = await db.query.products.findFirst({
    where: eq(products.id, args.productId),
    columns: { id: true, name: true, sku: true, stockQty: true, costEur: true, priceEur: true, unit: true },
  });
  if (!product) return { ok: false, reason: "geen-product" };

  const beschikbaar = Number(product.stockQty ?? 0);
  if (beschikbaar < args.qty) return { ok: false, reason: "te-weinig-voorraad", beschikbaar };

  const unitCost = product.costEur != null ? Number(product.costEur) : null;
  const unitPrice = args.unitPriceEur ?? (product.priceEur != null ? Number(product.priceEur) : null);
  const totalCost = unitCost != null ? Math.round(unitCost * args.qty * 100) / 100 : null;
  const totalPrice = unitPrice != null ? Math.round(unitPrice * args.qty * 100) / 100 : null;

  await db
    .update(products)
    .set({ stockQty: sql`coalesce(${products.stockQty}, 0) - ${String(args.qty)}`, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  const [row] = await db
    .insert(projectDeliveries)
    .values({
      projectId: args.projectId,
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      qty: String(args.qty),
      unitCostEur: unitCost != null ? unitCost.toFixed(2) : null,
      totalCostEur: totalCost != null ? totalCost.toFixed(2) : null,
      unitPriceEur: unitPrice != null ? unitPrice.toFixed(2) : null,
      totalPriceEur: totalPrice != null ? totalPrice.toFixed(2) : null,
      date: args.date,
      note: args.note?.trim() || null,
      createdBy: args.userId,
    })
    .returning({ id: projectDeliveries.id });

  await db.insert(activities).values({
    type: "note",
    subject: `Geleverd op project: ${product.name} × ${args.qty}`,
    body: `Kostprijs ${totalCost?.toFixed(2) ?? "?"} · verkoopwaarde ${totalPrice?.toFixed(2) ?? "?"}${args.note ? ` · ${args.note}` : ""}`,
    authorId: args.userId,
  });

  return { ok: true, id: row.id, qty: args.qty, costEur: totalCost ?? 0, priceEur: totalPrice ?? 0 };
}

/** Draait een levering terug: voorraad erbij, regel blijft staan als spoor. */
export async function reverseProjectDelivery(args: { id: string; userId: string | null }): Promise<boolean> {
  const [claim] = await db
    .update(projectDeliveries)
    .set({ reversedAt: new Date(), reversedBy: args.userId, updatedAt: new Date() })
    .where(sql`${projectDeliveries.id} = ${args.id} and ${projectDeliveries.reversedAt} is null`)
    .returning();
  if (!claim) return false;

  if (claim.productId) {
    await db
      .update(products)
      .set({ stockQty: sql`coalesce(${products.stockQty}, 0) + ${claim.qty}`, updatedAt: new Date() })
      .where(eq(products.id, claim.productId));
  }
  await db.insert(activities).values({
    type: "note",
    subject: `Levering teruggedraaid: ${claim.productName} × ${Number(claim.qty)}`,
    body: "Voorraad weer bijgeboekt; de levering telt niet meer mee op het project.",
    authorId: args.userId,
  });
  return true;
}

/** Wat er op dit project is geleverd, opgeteld — voor de projectcijfers. */
export async function deliveryTotals(projectId: string): Promise<{ cost: number; price: number; regels: number }> {
  const [r] = await db
    .select({
      cost: sql<number>`coalesce(sum(${projectDeliveries.totalCostEur}), 0)::float8`,
      price: sql<number>`coalesce(sum(${projectDeliveries.totalPriceEur}), 0)::float8`,
      regels: sql<number>`count(*)::int`,
    })
    .from(projectDeliveries)
    .where(sql`${projectDeliveries.projectId} = ${projectId} and ${projectDeliveries.reversedAt} is null`);
  return { cost: Number(r?.cost ?? 0), price: Number(r?.price ?? 0), regels: Number(r?.regels ?? 0) };
}
