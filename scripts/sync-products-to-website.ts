/**
 * Sync producten vanuit de CRM naar de habitat-one website.
 *
 * Gedrag:
 *   - Bestaande website-entries (matched op SKU) worden ALTIJD bijgewerkt:
 *     naam, omschrijving, afmetingen, foto-pad.
 *   - Nieuwe producten worden alleen aangemaakt als `pushToWebsite = true`
 *     staat in de CRM (dat is wat de UI-knop togglet).
 *   - Bij elke match (of nieuwe entry) wordt `websiteProductId` teruggeschreven
 *     naar de CRM zodat de productenlijst kan tonen wat al gepubliceerd is.
 *   - Voor nieuwe entries wordt category_id bepaald via een naam-match in
 *     habitat-one/tmp-data/categories.json (CRM `category` of `collection`).
 *
 *   npx tsx scripts/sync-products-to-website.ts                (dry run + write-back van matches)
 *   npx tsx scripts/sync-products-to-website.ts --apply        (echt schrijven)
 *   npx tsx scripts/sync-products-to-website.ts --apply --website ../habitat-one
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../lib/db";
import { products } from "../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const websiteArgIdx = process.argv.indexOf("--website");
const WEBSITE_ROOT = path.resolve(
  websiteArgIdx >= 0 && process.argv[websiteArgIdx + 1]
    ? process.argv[websiteArgIdx + 1]
    : path.join(__dirname, "..", "..", "habitat-one"),
);
const PRODUCTS_JSON = path.join(WEBSITE_ROOT, "tmp-data", "products.json");
const VARIANTS_JSON = path.join(WEBSITE_ROOT, "tmp-data", "product_variants.json");
const CATEGORIES_JSON = path.join(WEBSITE_ROOT, "tmp-data", "categories.json");
const PROD_CATS_JSON = path.join(WEBSITE_ROOT, "tmp-data", "product_categories.json");

const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "").trim();
const normName = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface WebsiteProduct {
  id: number;
  name: string;
  slug: string;
  description: string | null;
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

interface WebsiteVariant {
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

interface WebsiteCategory {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  is_active?: boolean;
}

interface ProductCategoryRow {
  id: number;
  product_id: number;
  category_id: number;
  is_primary: boolean;
  created_at: string;
}

async function main() {
  for (const p of [PRODUCTS_JSON, VARIANTS_JSON, CATEGORIES_JSON, PROD_CATS_JSON]) {
    if (!fs.existsSync(p)) {
      console.error(`Niet gevonden: ${p}`);
      console.error("Geef pad expliciet mee met --website <pad-naar-habitat-one>");
      process.exit(1);
    }
  }
  const websiteProducts: WebsiteProduct[] = JSON.parse(fs.readFileSync(PRODUCTS_JSON, "utf8"));
  const websiteVariants: WebsiteVariant[] = JSON.parse(fs.readFileSync(VARIANTS_JSON, "utf8"));
  const categories: WebsiteCategory[] = JSON.parse(fs.readFileSync(CATEGORIES_JSON, "utf8"));
  const prodCats: ProductCategoryRow[] = JSON.parse(fs.readFileSync(PROD_CATS_JSON, "utf8"));

  const catByName = new Map<string, WebsiteCategory>();
  for (const c of categories) catByName.set(normName(c.name), c);

  const bySku = new Map<string, WebsiteProduct>();
  for (const p of websiteProducts) {
    const k = normSku(p.sku);
    if (k) bySku.set(k, p);
  }
  let nextProductId = websiteProducts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
  let nextVariantId = websiteVariants.reduce((m, v) => Math.max(m, v.id), 0) + 1;
  let nextProdCatId = prodCats.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  const crmRows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      description: products.description,
      imageUrl: products.imageUrl,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      lengthMm: products.lengthMm,
      thicknessMm: products.thicknessMm,
      isActive: products.isActive,
      pushToWebsite: products.pushToWebsite,
      websiteProductId: products.websiteProductId,
      collection: products.collection,
      category: products.category,
    })
    .from(products)
    .where(isNotNull(products.sku));

  let updatedCount = 0;
  let createdCount = 0;
  let writeBackCount = 0;
  const noPhoto: Array<{ sku: string; name: string }> = [];
  const skipped: string[] = [];
  const log: string[] = [];

  const nowIso = new Date().toISOString();
  const writeBacks: Array<{ id: string; websiteId: number }> = [];

  for (const c of crmRows) {
    if (!c.isActive) continue;
    const skuKey = normSku(c.sku);
    if (!skuKey) continue;

    const nextW = num(c.widthMm);
    const nextH = num(c.heightMm);
    const nextL = num(c.lengthMm);
    const nextT = num(c.thicknessMm);

    const photoPath = (() => {
      const u = (c.imageUrl ?? "").trim();
      if (!u) return null;
      if (u.startsWith("/products/")) return u.replace(/^\/products\//, "");
      if (/^https?:\/\//i.test(u)) return null;
      return u;
    })();

    const w = bySku.get(skuKey);
    if (w) {
      // Bestaande website-entry — altijd bijwerken.
      const changes: string[] = [];
      if (w.name?.trim() !== c.name.trim()) { changes.push("naam"); w.name = c.name; }
      if ((c.description ?? "") && w.description !== c.description) {
        changes.push("omschrijving");
        w.description = c.description;
      }
      if (nextW !== w.width || nextH !== w.height || nextL !== w.length || nextT !== w.thickness) {
        changes.push("afmetingen");
        w.width = nextW; w.height = nextH; w.length = nextL; w.thickness = nextT;
        w.dimension_unit = "mm";
      }
      if (photoPath && w.thumbnail_path !== photoPath) {
        changes.push("foto");
        w.thumbnail_path = photoPath;
      }
      if (changes.length) {
        updatedCount++;
        log.push(`  ~ ${String(c.sku).padEnd(14)} ${c.name}   (${changes.join(", ")})`);
      }
      if (c.websiteProductId !== w.id) writeBacks.push({ id: c.id, websiteId: w.id });
      if (!photoPath) noPhoto.push({ sku: String(c.sku), name: c.name });
      continue;
    }

    // Geen match — alleen aanmaken als de gebruiker dat expliciet heeft aangevinkt.
    if (!c.pushToWebsite) {
      skipped.push(`  · ${String(c.sku).padEnd(14)} ${c.name}   (niet gemarkeerd voor website)`);
      continue;
    }

    const catName = (c.category ?? c.collection ?? "").trim();
    const matchedCat = catName ? catByName.get(normName(catName)) : undefined;

    const fresh: WebsiteProduct = {
      id: nextProductId++,
      name: c.name,
      slug: `${slugify(c.name) || `product-${nextProductId}`}-${Date.now()}`,
      description: c.description ?? null,
      short_description: null,
      sku: c.sku ?? null,
      thumbnail_path: photoPath,
      featured: false,
      width: nextW,
      height: nextH,
      length: nextL,
      thickness: nextT,
      dimension_unit: "mm",
      coverage_value: null,
      coverage_unit: null,
      stock_unit: "Pcs",
    };
    websiteProducts.push(fresh);
    bySku.set(skuKey, fresh);
    websiteVariants.push({
      id: nextVariantId++,
      product_id: fresh.id,
      variant_name: "Default",
      color_hex: null,
      sku_suffix: null,
      price_adjustment: 0,
      stock_quantity: 0,
      is_active: true,
      sort_order: 0,
      created_at: nowIso,
      updated_at: nowIso,
      in_stock: true,
      min_stock_level: 0,
    });
    if (matchedCat) {
      prodCats.push({
        id: nextProdCatId++,
        product_id: fresh.id,
        category_id: matchedCat.id,
        is_primary: true,
        created_at: nowIso,
      });
    }
    createdCount++;
    writeBacks.push({ id: c.id, websiteId: fresh.id });
    log.push(
      `  + ${String(c.sku).padEnd(14)} ${c.name}   (nieuw${matchedCat ? `, in ${matchedCat.name}` : `, GEEN categorie-match voor "${catName}"`}${photoPath ? "" : ", zonder foto"})`,
    );
    if (!photoPath) noPhoto.push({ sku: String(c.sku), name: c.name });
  }

  console.log(`CRM-producten (actief, met SKU): ${crmRows.length}`);
  console.log(`Website-entries bijgewerkt:      ${updatedCount}`);
  console.log(`Nieuwe entries op de website:    ${createdCount}`);
  console.log(`Overgeslagen (niet gemarkeerd):  ${skipped.length}`);
  console.log(`Match-id terug naar CRM:         ${writeBacks.length}`);
  console.log(`Zonder foto:                     ${noPhoto.length}`);

  if (log.length) {
    console.log("\nWijzigingen:");
    for (const l of log) console.log(l);
  }
  if (noPhoto.length) {
    console.log("\nNog geen foto — vul in CRM bij /products/<id>/edit de imageUrl (pad onder /products/...):");
    for (const p of noPhoto.slice(0, 50)) console.log(`  · ${p.sku.padEnd(14)} ${p.name}`);
    if (noPhoto.length > 50) console.log(`  … en ${noPhoto.length - 50} meer`);
  }

  if (!APPLY) {
    console.log("\nDry run — geen bestanden geschreven, geen CRM-write-back.");
    console.log(`Voeg --apply toe om te schrijven naar:`);
    console.log(`  ${PRODUCTS_JSON}`);
    console.log(`  ${VARIANTS_JSON}`);
    console.log(`  ${PROD_CATS_JSON}`);
    process.exit(0);
  }

  // Schrijf JSON-bronnen.
  if (updatedCount || createdCount) {
    fs.writeFileSync(PRODUCTS_JSON, JSON.stringify(websiteProducts, null, 2) + "\n", "utf8");
    if (createdCount) {
      fs.writeFileSync(VARIANTS_JSON, JSON.stringify(websiteVariants, null, 2) + "\n", "utf8");
      fs.writeFileSync(PROD_CATS_JSON, JSON.stringify(prodCats, null, 2) + "\n", "utf8");
    }
    console.log(`\n✅ Geschreven: ${PRODUCTS_JSON}`);
    if (createdCount) {
      console.log(`✅ Geschreven: ${VARIANTS_JSON}`);
      console.log(`✅ Geschreven: ${PROD_CATS_JSON}`);
    }
  }

  // Schrijf de website-id's terug naar CRM zodat de productenlijst klopt.
  for (const wb of writeBacks) {
    await db.update(products).set({ websiteProductId: wb.websiteId }).where(eq(products.id, wb.id));
    writeBackCount++;
  }
  if (writeBackCount) console.log(`✅ CRM bijgewerkt: ${writeBackCount} websiteProductId's gezet.`);

  if (updatedCount || createdCount) {
    console.log("\nVolgende stappen in de habitat-one repo:");
    console.log(`  1) cd ${WEBSITE_ROOT}`);
    console.log("  2) node tmp-data/gen2.mjs        # regenereer lib/data/*.generated.ts");
    console.log("  3) git diff && git commit -am 'sync products from CRM' && git push");
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
