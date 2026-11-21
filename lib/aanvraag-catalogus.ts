/**
 * Catalogus opzoeken voor een webaanvraag: producten én uitvoeringen, zodat de
 * offerte vanuit een aanvraag (handmatig of via de autopilot) dezelfde regels
 * en prijzen krijgt. De pure omzetting staat in `aanvraag-regels.ts`.
 */
import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { productVariants, products, type DocumentLineItem } from "@/lib/db/schema";
import { codeSleutel, offerteRegelsUitAanvraag, type CatalogusTreffer } from "@/lib/aanvraag-regels";

export async function offerteRegelsVoorAanvraag(skus: string[], names: string[]): Promise<DocumentLineItem[]> {
  
  
  if (skus.length > 0 || names.length > 0) {
    // De configurator op de website stuurt de code van de UITVOERING mee
    // ("BRA-5-GK-159"), niet die van het product. Alleen in `products` zoeken
    // vond negen van de tien codes van Donny Verboom niet, en die regels
    // kwamen zonder prijs binnen. Daarom beide tabellen.
    const treffers = new Map<string, CatalogusTreffer>();
    if (skus.length > 0) {
      const [prods, varianten] = await Promise.all([
        db.query.products.findMany({
          where: inArray(products.sku, skus),
          columns: { id: true, name: true, sku: true, priceEur: true, vatRate: true, category: true },
        }),
        db
          .select({
            sku: productVariants.sku,
            label: productVariants.label,
            priceEur: productVariants.priceEur,
            productId: products.id,
            productNaam: products.name,
            vatRate: products.vatRate,
            productPrijs: products.priceEur,
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(inArray(productVariants.sku, skus)),
      ]);
      for (const p of prods) {
        treffers.set(codeSleutel(p.sku), {
          productId: p.id,
          naam: p.name,
          prijsEur: p.priceEur != null ? Number(p.priceEur) : null,
          btw: p.vatRate,
          categorie: p.category,
        });
      }
      // Een uitvoering wint van het product: hij is specifieker gevraagd.
      for (const v of varianten) {
        treffers.set(codeSleutel(v.sku), {
          productId: v.productId,
          naam: v.productNaam,
          uitvoering: v.label,
          code: v.sku,
          prijsEur: v.priceEur != null ? Number(v.priceEur) : v.productPrijs != null ? Number(v.productPrijs) : null,
          btw: v.vatRate,
        });
      }
    }
    const gevraagd = (skus.length > 0 ? skus : names).map((waarde, i) =>
      skus.length > 0 ? { sku: waarde, naam: names[i] ?? null } : { sku: null, naam: waarde },
    );
    return offerteRegelsUitAanvraag(gevraagd, treffers);
  }
  return [];
}
