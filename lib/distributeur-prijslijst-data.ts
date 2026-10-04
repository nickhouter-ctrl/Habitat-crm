import "server-only";
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { catalogusItems } from "@/lib/distributeur-catalogus";
import type { PrijsOpties } from "@/lib/distributeur-prijzen";
export type { DistributeurItem, DistributeurMaat } from "@/lib/distributeur-catalogus";

export async function buildDistributeurItems(serie?: string, opties: PrijsOpties = {}) {
  const alles = !serie || serie.toUpperCase() === "ALL";
  const rows = await db.select({ id: products.id, name: products.name, sku: products.sku,
    category: products.category, imageUrl: products.imageUrl, widthMm: products.widthMm,
    heightMm: products.heightMm, additionalSizes: products.additionalSizes,
    description: products.description, price: products.priceEur, cost: products.costEur,
    vatRate: products.vatRate, stockQty: products.stockQty }).from(products).where(and(
      eq(products.collection, "Wandpanelen"), eq(products.isActive, true),
      isNotNull(products.priceEur), gt(products.priceEur, "0"), isNotNull(products.sku),
      ...(alles ? [] : [eq(products.category, serie!)]),
    )).orderBy(asc(products.category), asc(products.name));
  const items = catalogusItems(rows, opties);
  return { items, series: [...new Set(items.map(i => i.groep))].sort((a, b) => a.localeCompare(b, "nl")), totaal: items.length };
}
