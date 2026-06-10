/**
 * Helpers voor de samplecatalogus.
 *
 * SKU-strategie (bevestigd met de eigenaar):
 *  - Bestaande SKU's worden NOOIT gewijzigd.
 *  - Een catalogusvariant die aan een bestaand product gekoppeld is, neemt de
 *    bestaande SKU over (legacy_sku = sku).
 *  - Varianten zonder bestaand product krijgen een nieuwe `MS-###` code,
 *    oplopend vanaf het hoogste MS-nummer dat al in gebruik is — over zowel de
 *    gewone productentabel als de al bestaande catalogusvarianten heen, zodat
 *    er nooit een botsing ontstaat.
 */
import { ilike, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { catalogVariants, products } from "@/lib/db/schema";
import { nextSequentialSku } from "@/lib/products";

export const MS_PREFIX = "MS";

/** Alle MS-SKU's die al in gebruik zijn (producten + catalogusvarianten). */
export async function existingMsSkus(): Promise<string[]> {
  const [prod, cat] = await Promise.all([
    db
      .select({ sku: products.sku })
      .from(products)
      .where(ilike(products.sku, `${MS_PREFIX}%`)),
    db
      .select({ sku: catalogVariants.sku })
      .from(catalogVariants)
      .where(ilike(catalogVariants.sku, `${MS_PREFIX}%`)),
  ]);
  return [...prod, ...cat].map((r) => r.sku).filter((s): s is string => !!s);
}

/** De eerstvolgende vrije MS-SKU. */
export async function nextCatalogSku(): Promise<string> {
  return nextSequentialSku(MS_PREFIX, await existingMsSkus());
}

/**
 * Reserveer `n` opeenvolgende MS-SKU's in één keer (voor bulk-import). Telt het
 * hoogste bestaande nummer en geeft daarna oplopende codes terug.
 */
export async function nextCatalogSkus(n: number): Promise<string[]> {
  const existing = await existingMsSkus();
  let max = 0;
  const re = /^MS-?(\d+)$/i;
  for (const s of existing) {
    const m = s.match(re);
    if (m) {
      const v = Number(m[1]);
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(`${MS_PREFIX}-${String(max + i).padStart(3, "0")}`);
  return out;
}

/** Toon de te gebruiken SKU op het label: bestaande (legacy) heeft voorrang. */
export function displaySku(v: { sku: string; legacySku: string | null }): string {
  return v.legacySku ?? v.sku;
}

/** Mooie omschrijving van een catalogusvariant voor op de bestelbon. */
export function variantDescription(parts: {
  collection?: string | null;
  product?: string | null;
  color?: string | null;
  size?: string | null;
}): string {
  return [parts.collection, parts.product, parts.color, parts.size]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}
