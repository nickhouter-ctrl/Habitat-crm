/**
 * Koppel elke CRM-variant aan z'n eigen kleur-specifieke foto op de website.
 *
 * Match-strategie:
 *   1. CRM-SKU → website-variant met sku_suffix = SKU
 *   2. Per variant: pak de eerste image (primary first, anders type 'product', anders eerste)
 *   3. imageUrl = `<WEBSITE_PUBLIC_URL>/products/v/<image_id>.jpg`
 *
 * Fallback (als geen variant-match):
 *   - Naam-prefix → family-product.thumbnail_path → /products/v/<image_id>.jpg
 *
 *   npx tsx scripts/import-variant-photos.ts                    (dry run)
 *   npx tsx scripts/import-variant-photos.ts --apply
 *   npx tsx scripts/import-variant-photos.ts --apply --overwrite (vervang bestaande URLs)
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const WEBSITE_PUBLIC = (process.env.WEBSITE_PUBLIC_URL ?? "https://habitat-one-ecru.vercel.app").replace(/\/$/, "");
const SITE = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface WP { id: number; name: string; sku: string | null; thumbnail_path: string | null; }
interface WVariant { id: number; product_id: number; variant_name: string | null; sku_suffix: string | null; is_active: boolean; sort_order?: number; }
interface VImg { id: number; variant_id: number; image_path: string; is_primary: boolean; image_type: string; sort_order?: number; }

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(path.join(SITE, "products.json"), "utf8"));
  const variants: WVariant[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variants.json"), "utf8"));
  const varImgs: VImg[] = JSON.parse(fs.readFileSync(path.join(SITE, "product_variant_images.json"), "utf8"));

  const variantBySku = new Map<string, WVariant>();
  for (const v of variants) {
    if (v.sku_suffix) variantBySku.set(normSku(v.sku_suffix), v);
  }
  const imgsByVariant = new Map<number, VImg[]>();
  for (const im of varImgs) {
    if (!imgsByVariant.has(im.variant_id)) imgsByVariant.set(im.variant_id, []);
    imgsByVariant.get(im.variant_id)!.push(im);
  }
  const typeRank: Record<string, number> = { product: 0, cinematic: 1, explainer: 2 };
  for (const arr of imgsByVariant.values()) {
    arr.sort(
      (a, b) =>
        (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) ||
        (typeRank[a.image_type] ?? 3) - (typeRank[b.image_type] ?? 3) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
  }

  // Fallback: family-thumbnails via product_variant_images.image_path map
  const imgByPath = new Map(varImgs.map((v) => [v.image_path, v]));

  const all = await db
    .select({ id: products.id, name: products.name, sku: products.sku, isActive: products.isActive, imageUrl: products.imageUrl })
    .from(products)
    .where(OVERWRITE ? undefined : isNull(products.imageUrl));

  let updates = 0;
  const planned: Array<{ id: string; sku: string | null; name: string; url: string; via: string }> = [];
  const noMatch: Array<{ sku: string | null; name: string }> = [];

  for (const p of all) {
    if (!p.isActive) continue;
    let url: string | null = null;
    let via = "";

    const pickProduct = (imgs: VImg[]) => imgs.find((i) => i.image_type === "product") ?? null;

    // 1. Variant-match via CRM SKU → kleur-staal (product-type) van die specifieke kleur
    if (p.sku) {
      const vm = variantBySku.get(normSku(p.sku));
      if (vm) {
        const imgs = imgsByVariant.get(vm.id) ?? [];
        const productImg = pickProduct(imgs);
        if (productImg) {
          url = `${WEBSITE_PUBLIC}/products/v/${productImg.id}.jpg`;
          via = `variant ${vm.variant_name ?? vm.id} (${p.sku}) — kleurstaal`;
        }
      }
    }

    // 2. Fallback: pak een product-type foto van een sibling-variant
    //    (zelfde family, andere kleur — beter een kleurstaal van een andere kleur
    //    dan een sfeer-foto van de family).
    if (!url) {
      const pn = normName(p.name);
      const fam = site.find((w) => pn.startsWith(normName(w.name)));
      if (fam) {
        const sibVariants = variants.filter((v) => v.product_id === fam.id && v.is_active);
        for (const sv of sibVariants) {
          const sib = pickProduct(imgsByVariant.get(sv.id) ?? []);
          if (sib) {
            url = `${WEBSITE_PUBLIC}/products/v/${sib.id}.jpg`;
            via = `sibling-variant "${sv.variant_name}" van "${fam.name}"`;
            break;
          }
        }
        // Laatste redmiddel: family-thumbnail (kan sfeer zijn)
        if (!url && fam.thumbnail_path) {
          const im = imgByPath.get(fam.thumbnail_path);
          if (im) {
            url = `${WEBSITE_PUBLIC}/products/v/${im.id}.jpg`;
            via = `family-thumbnail "${fam.name}" (mogelijk sfeer-foto)`;
          }
        }
      }
    }

    if (!url) { noMatch.push({ sku: p.sku, name: p.name }); continue; }
    if (!OVERWRITE && p.imageUrl === url) continue;
    planned.push({ id: p.id, sku: p.sku, name: p.name, url, via });
    if (APPLY) {
      await db.update(products).set({ imageUrl: url, updatedAt: new Date() }).where(eq(products.id, p.id));
    }
    updates++;
  }

  console.log(`Producten bekeken:    ${all.length}`);
  console.log(`Te koppelen/wijzigen: ${updates}`);
  console.log(`Geen match gevonden:   ${noMatch.length}\n`);
  for (const p of planned.slice(0, 120)) {
    console.log(`  ${(p.sku ?? "—").padEnd(14)} ${p.name.padEnd(50)}  via ${p.via}`);
  }
  if (planned.length > 120) console.log(`  … en ${planned.length - 120} meer`);
  if (noMatch.length) {
    console.log("\nGeen variant-match (handmatig fixen of variant op website toevoegen):");
    for (const n of noMatch.slice(0, 60)) console.log(`  · ${(n.sku ?? "—").padEnd(14)} ${n.name}`);
    if (noMatch.length > 60) console.log(`  … en ${noMatch.length - 60} meer`);
  }
  if (!APPLY) console.log("\nDry run — voeg --apply (+ --overwrite) toe om te schrijven.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
