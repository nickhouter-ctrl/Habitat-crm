/**
 * Voor elk CRM-product met websiteProductId: pak de eerste product-type foto
 * van een variant onder DAT specifieke website-product. Verbetert situaties
 * waar mijn vorige import alle producten naar dezelfde family-thumbnail
 * koppelde (bv. 3 verschillende Wash basins met allemaal /products/v/274.jpg).
 *
 *   npx tsx scripts/refix-photos-via-webid.ts                (dry run)
 *   npx tsx scripts/refix-photos-via-webid.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const PUBLIC = (process.env.WEBSITE_PUBLIC_URL ?? "https://habitat-one-ecru.vercel.app").replace(/\/$/, "");
const SITE = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data");

interface WV { id: number; product_id: number; sku_suffix: string | null; sort_order?: number; }
interface VI { id: number; variant_id: number; image_path: string; is_primary: boolean; image_type: string; sort_order?: number; }

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();

async function main() {
  const wv: WV[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variants.json"), "utf8"));
  const vi: VI[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variant_images.json"), "utf8"));

  const crm = await db
    .select({ id: products.id, sku: products.sku, name: products.name, imageUrl: products.imageUrl, websiteProductId: products.websiteProductId })
    .from(products)
    .where(isNotNull(products.websiteProductId));

  let changed = 0;
  const log: Array<{ sku: string | null; name: string; was: string | null; becomes: string; via: string }> = [];

  for (const c of crm) {
    if (!c.websiteProductId) continue;
    const variants = wv.filter((v) => v.product_id === c.websiteProductId);
    if (!variants.length) continue;

    // 1. Variant met matching sku_suffix (per kleur/SKU)
    let pickImg: VI | undefined;
    let via = "";
    if (c.sku) {
      const skuVar = variants.find((v) => v.sku_suffix && normSku(v.sku_suffix) === normSku(c.sku));
      if (skuVar) {
        pickImg = vi.find((i) => i.variant_id === skuVar.id && i.image_type === "product");
        if (pickImg) via = `variant ${skuVar.id} (sku_suffix match) → img ${pickImg.id}`;
      }
    }
    // 2. Fallback: eerste product-type image van enige variant (sorted by variant sort_order)
    if (!pickImg) {
      const sortedVariants = [...variants].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      for (const v of sortedVariants) {
        const img = vi.find((i) => i.variant_id === v.id && i.image_type === "product");
        if (img) { pickImg = img; via = `variant ${v.id} → img ${img.id}`; break; }
      }
    }
    if (!pickImg) continue;

    const url = `${PUBLIC}/products/v/${pickImg.id}.jpg`;
    if (url === c.imageUrl) continue;
    log.push({ sku: c.sku, name: c.name, was: c.imageUrl, becomes: url, via });
    changed++;
    if (APPLY) {
      await db.update(products).set({ imageUrl: url, updatedAt: new Date() }).where(eq(products.id, c.id));
    }
  }

  console.log(`Te wijzigen: ${changed}\n`);
  for (const l of log.slice(0, 60)) {
    console.log(`  ${(l.sku ?? "—").padEnd(14)} ${l.name.padEnd(50)}  via ${l.via}`);
  }
  if (log.length > 60) console.log(`  … en ${log.length - 60} meer`);
  if (!APPLY) console.log("\nDry run — voeg --apply toe.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
