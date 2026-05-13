/**
 * Vul `imageUrl` in CRM voor producten die nog geen foto hebben maar wel
 * een bijbehorend product met foto op de habitat-one website hebben.
 *
 * Match-volgorde:
 *   1. SKU-match → website-product.thumbnail_path
 *   2. Naam-prefix-match (family) → eerste site-product met thumbnail
 *
 * URL-formaat: `<WEBSITE_PUBLIC_URL>/products/v/<variantImageId>.jpg`
 *   (gen2.mjs op habitat-one mapt thumbnail_path → /products/v/{id}.jpg via
 *   product_variant_images.json; die zelfde resolutie doen we hier.)
 *   Standaard https://habitat-one-ecru.vercel.app (override via WEBSITE_PUBLIC_URL).
 *
 *   npx tsx scripts/import-site-photos.ts          (dry run)
 *   npx tsx scripts/import-site-photos.ts --apply
 *   npx tsx scripts/import-site-photos.ts --apply --overwrite     (vervangt bestaande URLs)
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNull, or } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const OVERWRITE = process.argv.includes("--overwrite");
const WEBSITE_PUBLIC = (process.env.WEBSITE_PUBLIC_URL ?? "https://habitat-one-ecru.vercel.app").replace(/\/$/, "");
const SITE_JSON = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data", "products.json");
const VARIMG_JSON = path.resolve(__dirname, "..", "..", "habitat-one", "tmp-data", "product_variant_images.json");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface WP { id: number; name: string; sku: string | null; thumbnail_path: string | null; }
interface VImg { id: number; image_path: string; }

async function main() {
  const site: WP[] = JSON.parse(fs.readFileSync(SITE_JSON, "utf8"));
  const varImgs: VImg[] = JSON.parse(fs.readFileSync(VARIMG_JSON, "utf8"));
  const imgByPath = new Map(varImgs.map((v) => [v.image_path, v]));

  const bySku = new Map<string, WP>();
  for (const w of site) {
    if (w.sku && w.thumbnail_path) bySku.set(normSku(w.sku), w);
  }

  const noPhoto = await db
    .select({ id: products.id, name: products.name, sku: products.sku, isActive: products.isActive, imageUrl: products.imageUrl })
    .from(products)
    .where(OVERWRITE ? undefined : isNull(products.imageUrl));

  let updates = 0;
  const planned: Array<{ id: string; name: string; sku: string | null; url: string; via: string }> = [];

  for (const p of noPhoto) {
    if (!p.isActive) continue;
    let match: WP | undefined;
    let via = "";

    if (p.sku) {
      match = bySku.get(normSku(p.sku));
      if (match) via = `sku ${p.sku}`;
    }
    if (!match) {
      // Family-match: CRM-naam start met website-naam
      const pn = normName(p.name);
      // We zoeken site-producten waarvan de naam een prefix is van CRM-naam
      match = site.find((w) => {
        if (!w.thumbnail_path) return false;
        const wn = normName(w.name);
        return wn.length >= 3 && pn.startsWith(wn);
      });
      if (match) via = `naam-prefix "${match.name}"`;
    }
    if (!match || !match.thumbnail_path) continue;

    // Pas dezelfde resolutie toe als gen2.mjs: thumbnail_path → variant_image.id → /products/v/<id>.jpg
    const vi = imgByPath.get(match.thumbnail_path);
    if (!vi) continue;
    const url = `${WEBSITE_PUBLIC}/products/v/${vi.id}.jpg`;
    if (!OVERWRITE && p.imageUrl === url) continue;
    planned.push({ id: p.id, name: p.name, sku: p.sku, url, via });
    if (APPLY) {
      await db
        .update(products)
        .set({ imageUrl: url, updatedAt: new Date() })
        .where(eq(products.id, p.id));
    }
    updates++;
  }

  console.log(`Producten zonder foto:    ${noPhoto.length}`);
  console.log(`Foto's te koppelen:       ${updates}\n`);
  for (const p of planned.slice(0, 80)) {
    console.log(`  ${(p.sku ?? "—").padEnd(14)} ${p.name.padEnd(40)}  via ${p.via}`);
  }
  if (planned.length > 80) console.log(`  … en ${planned.length - 80} meer`);
  if (!APPLY) console.log("\nDry run — voeg --apply toe om te schrijven.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
