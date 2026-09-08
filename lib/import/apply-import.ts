/**
 * Het plan uit `product-import.ts` wegschrijven naar producten en uitvoeringen.
 *
 * Apart van de kern omdat dáár alles puur is. Hier zit de database-kant, en die
 * houdt zich aan dezelfde belofte: bijwerken op artikelcode, nooit iets
 * verwijderen wat niet in het bestand staat, en na afloop de afgeleide
 * `products.additionalSizes` opnieuw zetten zodat de offerteregel-kiezer,
 * /bestellen en de prijslijst kloppen.
 */
import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { productVariants, products, type NewProductVariant } from "@/lib/db/schema";
import type { GeplandProduct, ImportPlan } from "@/lib/import/product-import";
import { buildVariantSku } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";

export type ImportResultaat = {
  nieuweProducten: number;
  bijgewerkteProducten: number;
  nieuweUitvoeringen: number;
  bijgewerkteUitvoeringen: number;
};

const dec = (v: number | null | undefined) => (v == null ? null : String(v));

async function schrijfProduct(
  plan: GeplandProduct,
  merk: { id: string; skuPrefix: string | null },
): Promise<{ id: string; nieuw: boolean }> {
  const bestaand = await db.query.products.findFirst({
    where: eq(products.sku, plan.sku),
    columns: { id: true },
  });

  const waarden = {
    name: plan.name,
    sku: plan.sku,
    brandId: merk.id,
    collection: plan.collection,
    category: plan.category,
    subcategory: plan.subcategory,
    unit: plan.unit,
    optionAxes: plan.optionAxes.length ? plan.optionAxes : null,
    // Een merkartikel is een bestelartikel: het telt nooit mee in voorraad,
    // voorraadwaarde of lage-voorraadmeldingen.
    availability: "order_only" as const,
    isActive: true,
    updatedAt: new Date(),
  };

  if (bestaand) {
    await db.update(products).set(waarden).where(eq(products.id, bestaand.id));
    return { id: bestaand.id, nieuw: false };
  }
  const [rij] = await db.insert(products).values(waarden).returning({ id: products.id });
  return { id: rij.id, nieuw: true };
}

export async function applyImport(
  plan: ImportPlan,
  merk: { id: string; skuPrefix: string | null },
): Promise<ImportResultaat> {
  const uit: ImportResultaat = {
    nieuweProducten: 0,
    bijgewerkteProducten: 0,
    nieuweUitvoeringen: 0,
    bijgewerkteUitvoeringen: 0,
  };

  for (const p of plan.producten) {
    const { id: productId, nieuw } = await schrijfProduct(p, merk);
    if (nieuw) uit.nieuweProducten++;
    else uit.bijgewerkteProducten++;

    const codes = p.varianten.map((v) => v.code);
    const alAanwezig = codes.length
      ? await db
          .select({ id: productVariants.id, code: productVariants.code })
          .from(productVariants)
          .where(inArray(productVariants.code, codes))
      : [];
    const idPerCode = new Map(alAanwezig.map((r) => [r.code, r.id]));

    for (const v of p.varianten) {
      const waarden: NewProductVariant = {
        productId,
        brandId: merk.id,
        code: v.code,
        sku: buildVariantSku(merk.skuPrefix, v.code),
        label: v.label,
        options: v.options,
        priceEur: dec(v.priceEur),
        listPriceEur: dec(v.listPriceEur),
        discountPct: dec(v.discountPct),
        purchaseCostEur: dec(v.purchaseCostEur),
        costEur: dec(v.purchaseCostEur),
        imageUrl: v.imageUrl,
        sortOrder: v.sortOrder,
        sourceRef: v.sourceRef,
        lastImportedAt: new Date(),
        updatedAt: new Date(),
      };
      const bestaandId = idPerCode.get(v.code);
      if (bestaandId) {
        // Een lege prijs mag een bestaande prijs niet wissen — dat is de regel
        // uit de droogloop, en hij hoort ook hier te gelden.
        const schoon = Object.fromEntries(
          Object.entries(waarden).filter(([k, val]) => {
            if (val != null) return true;
            return !["priceEur", "listPriceEur", "purchaseCostEur", "costEur", "imageUrl"].includes(k);
          }),
        );
        await db.update(productVariants).set(schoon).where(eq(productVariants.id, bestaandId));
        uit.bijgewerkteUitvoeringen++;
      } else {
        await db.insert(productVariants).values(waarden);
        uit.nieuweUitvoeringen++;
      }
    }

    await syncVariantProjection(productId);
  }

  return uit;
}
