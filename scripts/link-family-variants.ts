/**
 * Koppel CRM-producten aan hun website-family-product zodat het groene
 * "✓ op site"-vinkje verschijnt. Match-volgorde:
 *
 *   1. SKU-match (al gedaan door sync-products-to-website, niet opnieuw)
 *   2. Naam-prefix: CRM-naam begint met website-naam (bv. "Age Stone - Beige"
 *      → website "Age Stone"). Pakt de LANGSTE prefix-match om vals-positieven
 *      te vermijden.
 *
 *   npx tsx scripts/link-family-variants.ts                (dry run)
 *   npx tsx scripts/link-family-variants.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const SITE_JSON = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data", "products.json");

const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface WP { id: number; name: string; sku: string | null; }

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(SITE_JSON, "utf8"));

  // Sorteer site-producten op naam-lengte (lang naar kort) zodat
  // "Roman Huge Travertine" boven "Huge Travertine" valt — anders zou
  // "Roman Huge Travertine Golden" matchen op "Huge Travertine" prefix.
  const sortedSite = [...site].sort((a, b) => normName(b.name).length - normName(a.name).length);

  const noLink = await db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .where(isNull(products.websiteProductId));

  const planned: Array<{ id: string; name: string; sku: string | null; wp: WP }> = [];
  for (const p of noLink) {
    const pn = normName(p.name);
    if (!pn) continue;
    const wp = sortedSite.find((w) => {
      const wn = normName(w.name);
      if (wn.length < 4) return false; // te kort → te veel false positives
      return pn === wn || pn.startsWith(wn + " ") || pn.startsWith(wn + "-");
    });
    if (!wp) continue;
    planned.push({ id: p.id, name: p.name, sku: p.sku, wp });
    if (APPLY) {
      await db
        .update(products)
        .set({ websiteProductId: wp.id, updatedAt: new Date() })
        .where(eq(products.id, p.id));
    }
  }

  console.log(`Producten zonder websiteProductId: ${noLink.length}`);
  console.log(`Te koppelen (family-match):        ${planned.length}\n`);
  for (const p of planned.slice(0, 120)) {
    console.log(`  ${(p.sku ?? "—").padEnd(14)} ${p.name.padEnd(48)}  →  #${p.wp.id} ${p.wp.name}`);
  }
  if (planned.length > 120) console.log(`  … en ${planned.length - 120} meer`);
  if (!APPLY) console.log("\nDry run — voeg --apply toe om te schrijven.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
