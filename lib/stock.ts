/**
 * Bereken effectieve voorraad voor bundle/kit-producten.
 *
 * Voor een set (bv. DR-002-SET) is de feitelijke voorraad het minimum van
 * (component_stock / qty_per_set) over alle componenten. Een set met
 * 1 deur + 4 hinges + 1 slot kan maximaal min(deuren, hinges/4, sloten)
 * keer verkocht worden.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";

export type KitComponent = { sku: string; qty: number };

/**
 * Gereserveerde voorraad per product-id: stuks uit **geaccepteerde offertes**
 * waarvan de bijbehorende verkoop nog niet fysiek is afgeboekt. Zodra een
 * document binnen hetzelfde **project** de voorraad afboekt (stockAppliedAt), is
 * de reservering "vervuld" — de fysieke voorraad is dan al gedaald, dus die
 * offerte telt niet meer als reservering (anders zou je dubbel aftrekken).
 *
 * Bewust in JS gesommeerd (niet in SQL) omdat `items` jsonb soms dubbel-encoded
 * is; `normalizeDocItems` pelt dat veilig af.
 */
export async function getReservedStockByProduct(): Promise<Map<string, number>> {
  const [estimates, booked] = await Promise.all([
    db.query.documents.findMany({
      where: and(eq(documents.kind, "estimate"), eq(documents.status, "accepted")),
      columns: { items: true, projectId: true },
    }),
    db.query.documents.findMany({
      where: and(
        inArray(documents.kind, ["invoice", "deliverynote"]),
        isNotNull(documents.stockAppliedAt),
      ),
      columns: { items: true, projectId: true },
    }),
  ]);

  // Per (product, project) netto rekenen: een gereserveerde offerte die binnen
  // hetzelfde project al is afgeboekt (factuur/pakbon) telt niet meer mee. Zo
  // voorkomen we dubbeltelling bij multi-product-projecten (bv. vloer gereserveerd
  // + deuren al verkocht in hetzelfde project).
  const estByPP = new Map<string, number>();
  const bookByPP = new Map<string, number>();
  const productOfKey = new Map<string, string>();
  const tally = (
    map: Map<string, number>,
    doc: { items: unknown; projectId: string | null },
  ) => {
    const proj = doc.projectId ?? "__none__";
    for (const it of normalizeDocItems(doc.items)) {
      if (!it.productId || !it.units) continue;
      const key = `${it.productId}|${proj}`;
      map.set(key, (map.get(key) ?? 0) + Number(it.units));
      productOfKey.set(key, it.productId);
    }
  };
  for (const e of estimates) tally(estByPP, e);
  for (const b of booked) tally(bookByPP, b);

  const reserved = new Map<string, number>();
  for (const [key, est] of estByPP) {
    const net = Math.max(0, est - (bookByPP.get(key) ?? 0));
    if (net <= 0) continue;
    const pid = productOfKey.get(key)!;
    reserved.set(pid, (reserved.get(pid) ?? 0) + net);
  }
  return reserved;
}

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
