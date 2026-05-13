/**
 * Koppel CRM-producten aan hun website-family via product_variants.sku_suffix.
 *
 * Match-volgorde:
 *   1. variant.sku_suffix == CRM-SKU → variant.product_id = website-family-id
 *      (meest betrouwbaar — werkt ook als family-namen vreemd zijn op de site)
 *   2. SKU exact match in products.json
 *   3. Naam-prefix match (langste prefix wint)
 *
 *   npx tsx scripts/link-via-variants.ts                (dry run)
 *   npx tsx scripts/link-via-variants.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const SITE = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface WP { id: number; name: string; sku: string | null; }
interface WV { id: number; product_id: number; sku_suffix: string | null; }

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(path.join(SITE, "products.json"), "utf8"));
  const variants: WV[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variants.json"), "utf8"));

  const familyBySku = new Map<string, WP>();
  for (const w of site) if (w.sku) familyBySku.set(normSku(w.sku), w);

  // Belangrijkste: variant-sku_suffix → family-product
  const familyIdByVariantSku = new Map<string, number>();
  for (const v of variants) {
    if (v.sku_suffix) familyIdByVariantSku.set(normSku(v.sku_suffix), v.product_id);
  }

  // Sorteer op naam-lengte voor de prefix-fallback
  const sorted = [...site].sort((a, b) => normName(b.name).length - normName(a.name).length);

  const all = await db
    .select({ id: products.id, name: products.name, sku: products.sku, websiteProductId: products.websiteProductId })
    .from(products);

  const changes: Array<{ id: string; sku: string | null; name: string; was: number | null; becomes: number; via: string }> = [];
  const unlinked: Array<{ sku: string | null; name: string }> = [];

  for (const p of all) {
    let famId: number | undefined;
    let via = "";

    if (p.sku) {
      // 1. variant-suffix
      famId = familyIdByVariantSku.get(normSku(p.sku));
      if (famId) via = `variant-suffix ${p.sku}`;
      // 2. family-SKU exact
      if (!famId) {
        const fam = familyBySku.get(normSku(p.sku));
        if (fam) { famId = fam.id; via = `family-sku ${fam.sku}`; }
      }
    }
    // 3. prefix
    if (!famId) {
      const pn = normName(p.name);
      const fam = sorted.find((w) => {
        const wn = normName(w.name);
        if (wn.length < 4) return false;
        return pn === wn || pn.startsWith(wn + " ") || pn.startsWith(wn + "-");
      });
      if (fam) { famId = fam.id; via = `prefix "${fam.name}"`; }
    }

    if (!famId) { unlinked.push({ sku: p.sku, name: p.name }); continue; }
    if (famId === p.websiteProductId) continue;
    changes.push({ id: p.id, sku: p.sku, name: p.name, was: p.websiteProductId, becomes: famId, via });
    if (APPLY) {
      await db.update(products).set({ websiteProductId: famId, updatedAt: new Date() }).where(eq(products.id, p.id));
    }
  }

  console.log(`CRM-producten:            ${all.length}`);
  console.log(`Te koppelen of wijzigen:  ${changes.length}`);
  console.log(`Ongekoppeld:              ${unlinked.length}\n`);
  for (const c of changes.slice(0, 150)) {
    console.log(`  ${(c.sku ?? "—").padEnd(14)} ${c.name.padEnd(48)} ${c.was ? "(was #" + c.was + ")" : ""} → #${c.becomes}   via ${c.via}`);
  }
  if (changes.length > 150) console.log(`  … en ${changes.length - 150} meer`);
  if (!APPLY) console.log("\nDry run — voeg --apply toe.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
