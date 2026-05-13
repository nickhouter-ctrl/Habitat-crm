/**
 * Bulk-push: zet alle CRM-producten zonder website-twin naar habitat-one in
 * één atomic GitHub-commit. Foto's worden NIET geforceerd — producten zonder
 * imageUrl krijgen een placeholder en de "geen foto"-melding blijft in CRM
 * staan zodat je 'm later kunt aanvullen.
 *
 *   npx tsx scripts/bulk-push-to-website.ts                (dry run)
 *   npx tsx scripts/bulk-push-to-website.ts --apply
 */
import "./load-env";
import { eq, isNotNull, isNull, and } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";
import { commitFiles, getTextFile } from "../lib/website/github-client";
import { fetchProductImageBytes } from "../lib/storage";
import { translateText, type Locale } from "../lib/translate";

const APPLY = process.argv.includes("--apply");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function extFromContentType(ct: string): string {
  if (/png/.test(ct)) return "png";
  if (/webp/.test(ct)) return "webp";
  if (/avif/.test(ct)) return "avif";
  return "jpg";
}

interface WP {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  description_i18n?: Partial<Record<Locale, string>> | null;
  short_description: string | null;
  sku: string | null;
  thumbnail_path: string | null;
  featured: boolean;
  width: number | null;
  height: number | null;
  length: number | null;
  thickness: number | null;
  dimension_unit: string | null;
  coverage_value: number | null;
  coverage_unit: string | null;
  stock_unit: string | null;
  [key: string]: unknown;
}
interface WV {
  id: number;
  product_id: number;
  variant_name: string | null;
  color_hex: string | null;
  sku_suffix: string | null;
  price_adjustment: number;
  stock_quantity: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  in_stock: boolean;
  min_stock_level: number;
}
interface WC { id: number; name: string; slug: string; parent_id: number | null; }
interface WPC { id: number; product_id: number; category_id: number; is_primary: boolean; created_at: string; }

async function main() {
  // 1. Selecteer kandidaten: actief, met SKU, géén website-id
  const candidates = await db
    .select({
      id: products.id, name: products.name, sku: products.sku,
      description: products.description, imageUrl: products.imageUrl,
      collection: products.collection, category: products.category,
      widthMm: products.widthMm, heightMm: products.heightMm,
      lengthMm: products.lengthMm, thicknessMm: products.thicknessMm,
    })
    .from(products)
    .where(and(eq(products.isActive, true), isNotNull(products.sku), isNull(products.websiteProductId)));
  console.log(`Kandidaten: ${candidates.length}`);

  if (!candidates.length) { console.log("Niets te doen."); process.exit(0); }

  // 2. Huidige website-JSON laden
  const [pf, vf, cf, pcf] = await Promise.all([
    getTextFile("tmp-data/products.json"),
    getTextFile("tmp-data/product_variants.json"),
    getTextFile("tmp-data/categories.json"),
    getTextFile("tmp-data/product_categories.json"),
  ]);
  if (!pf || !vf || !cf || !pcf) throw new Error("Kan website-JSON niet ophalen — GITHUB_TOKEN_HABITAT_ONE OK?");
  const websiteProducts: WP[] = JSON.parse(pf.text);
  const websiteVariants: WV[] = JSON.parse(vf.text);
  const categories: WC[] = JSON.parse(cf.text);
  const prodCats: WPC[] = JSON.parse(pcf.text);

  let nextPid = websiteProducts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  let nextVid = websiteVariants.reduce((m, v) => Math.max(m, v.id), 0) + 1;
  let nextRowId = prodCats.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const skuToWebsiteId = new Map<string, number>();
  const filesToCommit: Array<{ path: string; content: string | Uint8Array }> = [];
  const nowIso = new Date().toISOString();
  const log: string[] = [];

  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  for (const c of candidates) {
    const skuKey = normSku(c.sku);
    // Skip dubbele matches (zou niet voorkomen, maar voor de zekerheid)
    if (websiteProducts.some((p) => normSku(p.sku) === skuKey)) continue;

    // Vertaal omschrijving (best-effort)
    let i18n: Partial<Record<Locale, string>> | null = null;
    if (c.description?.trim()) {
      if (hasOpenAI) {
        try {
          const out = await translateText({
            text: c.description, fromLocale: "nl", targetLocales: ["de", "en", "es"],
          });
          i18n = { nl: c.description, ...out };
        } catch {
          i18n = { nl: c.description };
        }
      } else {
        i18n = { nl: c.description };
      }
    }

    const photoPath: string | null = (() => {
      const u = (c.imageUrl ?? "").trim();
      if (!u) return null;
      if (u.startsWith("/products/")) return u.replace(/^\/products\//, "");
      // Onze imageUrls wijzen meestal naar habitat-one-ecru.vercel.app/products/v/<id>.jpg —
      // die bestandsnaam kunnen we direct overnemen als thumbnail_path.
      const m = u.match(/\/products\/(v\/[^/]+|[^/]+)$/);
      return m ? m[1] : null;
    })();

    const entry: WP = {
      id: nextPid++,
      name: c.name,
      slug: `${slugify(c.name) || `product-${nextPid}`}-${Date.now()}`,
      description: c.description ?? null,
      description_i18n: i18n,
      short_description: null,
      sku: c.sku,
      thumbnail_path: photoPath,
      featured: false,
      width: num(c.widthMm),
      height: num(c.heightMm),
      length: num(c.lengthMm),
      thickness: num(c.thicknessMm),
      dimension_unit: "mm",
      coverage_value: null,
      coverage_unit: null,
      stock_unit: "Pcs",
    };
    websiteProducts.push(entry);
    skuToWebsiteId.set(skuKey, entry.id);

    // Default variant (zodat de site-gallery werkt)
    websiteVariants.push({
      id: nextVid++,
      product_id: entry.id,
      variant_name: "Default",
      color_hex: null,
      sku_suffix: c.sku,
      price_adjustment: 0,
      stock_quantity: 0,
      is_active: true,
      sort_order: 0,
      created_at: nowIso,
      updated_at: nowIso,
      in_stock: true,
      min_stock_level: 0,
    });

    // Category-mapping (best-effort op naam)
    const catName = (c.category ?? c.collection ?? "").trim();
    const matched = catName ? categories.find((cat) => normName(cat.name) === normName(catName)) : undefined;
    if (matched) {
      prodCats.push({
        id: nextRowId++,
        product_id: entry.id,
        category_id: matched.id,
        is_primary: true,
        created_at: nowIso,
      });
    }
    log.push(`  + ${(c.sku ?? "—").padEnd(14)} ${c.name}${matched ? `  [cat: ${matched.name}]` : "  [geen cat-match]"}${photoPath ? "" : "  [geen foto]"}`);
  }

  if (!log.length) { console.log("Niets nieuws — alle SKU's bestaan al."); process.exit(0); }

  console.log(`Toevoegen aan website: ${log.length}\n`);
  for (const l of log.slice(0, 80)) console.log(l);
  if (log.length > 80) console.log(`  … en ${log.length - 80} meer`);

  if (!APPLY) { console.log("\nDry run — voeg --apply toe om te committen."); process.exit(0); }

  filesToCommit.push({ path: "tmp-data/products.json", content: JSON.stringify(websiteProducts, null, 2) + "\n" });
  filesToCommit.push({ path: "tmp-data/product_variants.json", content: JSON.stringify(websiteVariants, null, 2) + "\n" });
  filesToCommit.push({ path: "tmp-data/product_categories.json", content: JSON.stringify(prodCats, null, 2) + "\n" });

  const commit = await commitFiles({
    message: `feat(products): bulk-import ${log.length} CRM-products into the website catalog`,
    files: filesToCommit,
  });
  console.log(`\n✅ Commit: ${commit.commitUrl}`);

  // websiteProductId terugschrijven
  for (const [sku, websiteId] of skuToWebsiteId.entries()) {
    const p = candidates.find((c) => normSku(c.sku) === sku);
    if (!p) continue;
    await db.update(products).set({ websiteProductId: websiteId, pushToWebsite: true, updatedAt: new Date() }).where(eq(products.id, p.id));
  }
  console.log(`✅ CRM bijgewerkt: ${skuToWebsiteId.size} websiteProductId's gezet.`);
  console.log("Vercel deployt habitat-one automatisch.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
