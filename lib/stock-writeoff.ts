/**
 * Voorraad afboeken zonder verkoop: showroommodel, eigen gebruik, monster, breuk.
 *
 * Voorheen kon voorraad alleen dalen door een verkoopfactuur. Wie een bank in de
 * showroom zette paste het aantal met de hand aan op het product: geen reden,
 * geen datum, geen wie — en de kostprijs verdween stil uit de voorraadwaarde.
 *
 * Twee dingen die hier bewust zo zijn:
 *  - **De kostprijs wordt vastgelegd**, niet later herrekend. Verandert de
 *    inkoopprijs volgend jaar, dan blijft de showroombank staan voor wat hij
 *    ons destijds kostte.
 *  - **Terugdraaien wist niets.** De regel blijft staan met `reversed_at`, de
 *    voorraad gaat terug en een eventuele projectkostenregel verdwijnt. Een
 *    voorraadmutatie die spoorloos kan verdwijnen is geen administratie.
 */
import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, products, projectCosts, stockWriteoffs } from "@/lib/db/schema";

export const WRITEOFF_REASONS = [
  { value: "showroom", label: "Showroom" },
  { value: "own_use", label: "Eigen gebruik" },
  { value: "sample", label: "Monster weggegeven" },
  { value: "damage", label: "Breuk / beschadigd" },
  { value: "correction", label: "Telverschil" },
  { value: "other", label: "Overig" },
] as const;

export type WriteoffReason = (typeof WRITEOFF_REASONS)[number]["value"];

export const REASON_LABEL: Record<string, string> = Object.fromEntries(
  WRITEOFF_REASONS.map((r) => [r.value, r.label]),
);

export type WriteoffResult =
  | { ok: true; id: string; qty: number; totalCostEur: number }
  | { ok: false; reason: "geen-product" | "geen-aantal" | "te-weinig-voorraad"; beschikbaar?: number };

/**
 * Boekt `qty` van een product af. Trekt de voorraad in ÉÉN statement af zodat
 * twee mensen tegelijk niet allebei van dezelfde stand uitgaan, en weigert als
 * er niet genoeg staat — negatieve voorraad is altijd een fout, geen feit.
 */
export async function writeOffStock(args: {
  productId: string;
  qty: number;
  reason: WriteoffReason;
  date: string;
  note?: string | null;
  projectId?: string | null;
  userId: string | null;
  /** Toestaan dat de voorraad negatief wordt (alleen bij een telverschil). */
  allowNegative?: boolean;
}): Promise<WriteoffResult> {
  if (!args.productId) return { ok: false, reason: "geen-product" };
  if (!(args.qty > 0)) return { ok: false, reason: "geen-aantal" };

  const product = await db.query.products.findFirst({
    where: eq(products.id, args.productId),
    columns: { id: true, name: true, sku: true, stockQty: true, costEur: true, unit: true },
  });
  if (!product) return { ok: false, reason: "geen-product" };

  const beschikbaar = Number(product.stockQty ?? 0);
  if (!args.allowNegative && beschikbaar < args.qty) {
    return { ok: false, reason: "te-weinig-voorraad", beschikbaar };
  }

  const unitCost = product.costEur != null ? Number(product.costEur) : null;
  const totalCost = unitCost != null ? Math.round(unitCost * args.qty * 100) / 100 : null;

  // Voorraad in één statement bijwerken (lees-en-schrijf in de database, niet in
  // JS) — anders kunnen twee gelijktijdige afboekingen dezelfde stand gebruiken.
  await db
    .update(products)
    .set({ stockQty: sql`coalesce(${products.stockQty}, 0) - ${String(args.qty)}`, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  // Op een project? Dan ook als kostenregel, zodat het in de projectkosten telt.
  let projectCostId: string | null = null;
  if (args.projectId && totalCost != null && totalCost !== 0) {
    const [kost] = await db
      .insert(projectCosts)
      .values({
        projectId: args.projectId,
        date: args.date,
        category: "material",
        description: `Voorraad: ${product.name}${args.qty !== 1 ? ` × ${args.qty}` : ""} (${REASON_LABEL[args.reason] ?? args.reason})`,
        amountEur: totalCost.toFixed(2),
      })
      .returning({ id: projectCosts.id });
    projectCostId = kost?.id ?? null;
  }

  const [row] = await db
    .insert(stockWriteoffs)
    .values({
      productId: product.id,
      productName: product.name,
      sku: product.sku ?? null,
      qty: String(args.qty),
      reason: args.reason,
      unitCostEur: unitCost != null ? unitCost.toFixed(2) : null,
      totalCostEur: totalCost != null ? totalCost.toFixed(2) : null,
      projectId: args.projectId ?? null,
      projectCostId,
      date: args.date,
      note: args.note?.trim() || null,
      createdBy: args.userId,
    })
    .returning({ id: stockWriteoffs.id });

  await db.insert(activities).values({
    type: "note",
    subject: `Voorraad afgeboekt: ${product.name} × ${args.qty}`,
    body: `${REASON_LABEL[args.reason] ?? args.reason}${totalCost != null ? ` · kostprijs ${totalCost.toFixed(2)}` : ""}${args.note ? ` · ${args.note}` : ""}`,
    authorId: args.userId,
  });

  return { ok: true, id: row.id, qty: args.qty, totalCostEur: totalCost ?? 0 };
}

/** Draait een afboeking terug: voorraad erbij, projectkostenregel weg, spoor blijft. */
export async function reverseStockWriteoff(args: { id: string; userId: string | null }): Promise<boolean> {
  // Atomair claimen, anders draaien twee kliks 'm twee keer terug.
  const [claim] = await db
    .update(stockWriteoffs)
    .set({ reversedAt: new Date(), reversedBy: args.userId, updatedAt: new Date() })
    .where(sql`${stockWriteoffs.id} = ${args.id} and ${stockWriteoffs.reversedAt} is null`)
    .returning();
  if (!claim) return false;

  if (claim.productId) {
    await db
      .update(products)
      .set({ stockQty: sql`coalesce(${products.stockQty}, 0) + ${claim.qty}`, updatedAt: new Date() })
      .where(eq(products.id, claim.productId));
  }
  if (claim.projectCostId) {
    await db.delete(projectCosts).where(eq(projectCosts.id, claim.projectCostId));
  }
  await db.insert(activities).values({
    type: "note",
    subject: `Voorraadafboeking teruggedraaid: ${claim.productName} × ${Number(claim.qty)}`,
    body: `Voorraad weer bijgeboekt${claim.projectCostId ? " en de projectkostenregel verwijderd" : ""}.`,
    authorId: args.userId,
  });
  return true;
}
