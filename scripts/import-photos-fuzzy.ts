/**
 * Fuzzy photo-import: voor CRM-producten zonder imageUrl, zoek een website-
 * product met een GERELATEERDE SKU (prefix-match in beide richtingen) + foto.
 *
 *   npx tsx scripts/import-photos-fuzzy.ts                (dry run)
 *   npx tsx scripts/import-photos-fuzzy.ts --apply
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const WEBSITE_PUBLIC = (process.env.WEBSITE_PUBLIC_URL ?? "https://habitat-one-ecru.vercel.app").replace(/\/$/, "");
const SITE = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();

interface WP { id: number; sku: string | null; name: string; thumbnail_path: string | null; }
interface WV { id: number; product_id: number; sku_suffix: string | null; }
interface VI { id: number; variant_id: number; image_path: string; is_primary: boolean; image_type: string; }

async function main() {
  const wp: WP[] = JSON.parse(fs.readFileSync(path.join(SITE, "products.json"), "utf8"));
  const wv: WV[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variants.json"), "utf8"));
  const vi: VI[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variant_images.json"), "utf8"));
  const imgByPath = new Map(vi.map((x) => [x.image_path, x]));
  const variantsByProd = new Map<number, WV[]>();
  for (const v of wv) {
    if (!variantsByProd.has(v.product_id)) variantsByProd.set(v.product_id, []);
    variantsByProd.get(v.product_id)!.push(v);
  }

  // Index: per website-product, vind een product-foto (eerste image_type='product').
  function getProductPhoto(wpEntry: WP): string | null {
    if (wpEntry.thumbnail_path) {
      const im = imgByPath.get(wpEntry.thumbnail_path);
      if (im) return `${WEBSITE_PUBLIC}/products/v/${im.id}.jpg`;
    }
    const variants = variantsByProd.get(wpEntry.id) ?? [];
    for (const v of variants) {
      const img = vi.find((i) => i.variant_id === v.id && i.image_type === "product");
      if (img) return `${WEBSITE_PUBLIC}/products/v/${img.id}.jpg`;
    }
    return null;
  }

  const crm = await db
    .select({ id: products.id, sku: products.sku, name: products.name })
    .from(products)
    .where(isNull(products.imageUrl));

  let matched = 0;
  const log: Array<{ sku: string | null; name: string; url: string; via: string }> = [];

  for (const c of crm) {
    if (!c.sku) continue;
    const cKey = normSku(c.sku);

    // 1. Exact SKU match — alleen accepteren als die website-entry een foto heeft
    let exactTarget = wp.find((p) => normSku(p.sku) === cKey);
    let target: WP | undefined = exactTarget && getProductPhoto(exactTarget) ? exactTarget : undefined;
    let via = target ? "exact-sku" : "";

    // 2. Fuzzy: CRM-SKU is substring van website-SKU (KKR-B051 → KKR-B051-A)
    if (!target) {
      const candidates = wp
        .filter((p) => p.sku && normSku(p.sku).startsWith(cKey) && normSku(p.sku) !== cKey)
        .sort((a, b) => (a.sku!.length - b.sku!.length));
      const withPhoto = candidates.find((p) => getProductPhoto(p));
      if (withPhoto) {
        target = withPhoto;
        via = `prefix-extends "${withPhoto.sku}"`;
      }
    }
    // 3. Fuzzy: website-SKU is substring van CRM-SKU (KKR-B008-BB → CRM KKR-B008-B is langer? Nee, BB is langer)
    if (!target) {
      const candidates = wp
        .filter((p) => p.sku && cKey.startsWith(normSku(p.sku)) && normSku(p.sku) !== cKey)
        .sort((a, b) => (b.sku!.length - a.sku!.length));
      const withPhoto = candidates.find((p) => getProductPhoto(p));
      if (withPhoto) {
        target = withPhoto;
        via = `prefix-shorter "${withPhoto.sku}"`;
      }
    }
    // 4. Common-prefix fuzzy: KKR-B008-B en KKR-B008-BB delen "KKR-B008-B" → 9 chars
    if (!target) {
      const common = wp
        .filter((p) => p.sku)
        .map((p) => {
          const pk = normSku(p.sku);
          let i = 0;
          while (i < cKey.length && i < pk.length && cKey[i] === pk[i]) i++;
          return { p, common: i };
        })
        .filter((x) => x.common >= Math.min(cKey.length, 7))
        .sort((a, b) => b.common - a.common);
      const withPhoto = common.find((x) => getProductPhoto(x.p));
      if (withPhoto) {
        target = withPhoto.p;
        via = `common-prefix(${withPhoto.common}) "${withPhoto.p.sku}"`;
      }
    }

    if (!target) continue;
    const url = getProductPhoto(target);
    if (!url) continue;

    matched++;
    log.push({ sku: c.sku, name: c.name, url, via });
    if (APPLY) {
      await db.update(products).set({ imageUrl: url, websiteProductId: target.id, updatedAt: new Date() }).where(eq(products.id, c.id));
    }
  }

  console.log(`Gematcht via fuzzy: ${matched}\n`);
  for (const l of log) {
    console.log(`  ${(l.sku ?? "—").padEnd(14)} ${l.name.padEnd(50)}  via ${l.via}`);
    console.log(`    → ${l.url}`);
  }
  if (!APPLY) console.log("\nDry run — voeg --apply toe.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
