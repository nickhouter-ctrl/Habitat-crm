/**
 * Bereken effectieve voorraad voor bundle/kit-producten.
 *
 * Voor een set (bv. DR-002-SET) is de feitelijke voorraad het minimum van
 * (component_stock / qty_per_set) over alle componenten. Een set met
 * 1 deur + 4 hinges + 1 slot kan maximaal min(deuren, hinges/4, sloten)
 * keer verkocht worden.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

export type KitComponent = { sku: string; qty: number };

/** Effectieve voorraad voor één set, gegeven een lookup-map van component-SKU → stockQty. */
export function computeKitStock(
  components: KitComponent[],
  stockBySku: Map<string, number | null>,
): number {
  if (!components.length) return 0;
  let minSets = Infinity;
  for (const c of components) {
    const compStock = Number(stockBySku.get(c.sku) ?? 0);
    const qty = Number(c.qty);
    if (qty <= 0) continue;
    const setsFromThisComp = Math.floor(compStock / qty);
    if (setsFromThisComp < minSets) minSets = setsFromThisComp;
  }
  return minSets === Infinity ? 0 : Math.max(0, minSets);
}

/** Voor een lijst kit-producten: bereken voor elk de effectieve voorraad. Doet 1 DB-query. */
export async function resolveKitStocks(
  kits: Array<{ sku: string | null; components: KitComponent[] | null }>,
): Promise<Map<string, number>> {
  const allComponentSkus = new Set<string>();
  for (const k of kits) {
    for (const c of k.components ?? []) allComponentSkus.add(c.sku);
  }
  if (allComponentSkus.size === 0) return new Map();
  const rows = await db
    .select({ sku: products.sku, stockQty: products.stockQty })
    .from(products)
    .where(inArray(products.sku, Array.from(allComponentSkus)));
  const stockBySku = new Map<string, number | null>();
  for (const r of rows) {
    if (r.sku) stockBySku.set(r.sku, r.stockQty == null ? null : Number(r.stockQty));
  }
  const out = new Map<string, number>();
  for (const k of kits) {
    if (!k.sku || !k.components?.length) continue;
    out.set(k.sku, computeKitStock(k.components, stockBySku));
  }
  return out;
}
