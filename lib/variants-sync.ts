/**
 * De brug tussen `product_variants` (de bron) en `products.additionalSizes`
 * (wat de rest van het CRM al leest).
 *
 * Apart van lib/variants.ts omdat dáár alles puur is en zonder database
 * getest wordt. Hier zit de enige schrijfactie: na élke wijziging aan de
 * uitvoeringen van een product wordt de afgeleide lijst opnieuw gezet, zodat
 * de maatkiezer op de offerteregel, /bestellen, /scan, de prijslijst-PDF en de
 * portal-prijzen voor de website automatisch kloppen.
 */
import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { productVariants, products } from "@/lib/db/schema";
import { toAdditionalSizes } from "@/lib/variants";

/**
 * Herschrijft `products.additionalSizes` uit de uitvoeringen van dit product.
 * Geen uitvoeringen (meer) → het veld gaat op null, precies zoals een product
 * zonder maten er altijd al uitzag.
 *
 * LET OP: dit overschrijft handmatig ingevoerde maten. Roep het alleen aan voor
 * producten die écht uitvoeringen hebben, of gebruik
 * {@link syncVariantProjectionIfAny} — anders wist het toekennen van een merk
 * aan een bestaand product zijn maten.
 */
export async function syncVariantProjection(productId: string): Promise<number> {
  const rijen = await db
    .select({
      code: productVariants.code,
      sku: productVariants.sku,
      label: productVariants.label,
      options: productVariants.options,
      priceEur: productVariants.priceEur,
      purchaseCostEur: productVariants.purchaseCostEur,
      costEur: productVariants.costEur,
      stockQty: productVariants.stockQty,
      imageUrl: productVariants.imageUrl,
      isActive: productVariants.isActive,
      sortOrder: productVariants.sortOrder,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sortOrder), asc(productVariants.label));

  const maten = toAdditionalSizes(rijen);
  await db
    .update(products)
    .set({ additionalSizes: maten.length ? maten : null, updatedAt: new Date() })
    .where(eq(products.id, productId));
  return maten.length;
}

/**
 * Alleen bijwerken als er echt uitvoeringen zijn. Dit is wat je wilt na een
 * gewone opslag van het productformulier: een merk toekennen aan een bestaand
 * product mag zijn handmatig ingevoerde maten niet wegvagen.
 */
export async function syncVariantProjectionIfAny(productId: string): Promise<number | null> {
  const [rij] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
  if (!rij?.n) return null;
  return syncVariantProjection(productId);
}

/** Hetzelfde voor een reeks producten — na een import. */
export async function syncVariantProjections(productIds: string[]): Promise<number> {
  let totaal = 0;
  for (const id of [...new Set(productIds)]) totaal += await syncVariantProjection(id);
  return totaal;
}
