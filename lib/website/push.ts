/**
 * Push één CRM-product naar habitat-one via één atomic GitHub-commit.
 *
 * Wat er gecommit wordt:
 *   - tmp-data/products.json            (update of nieuwe entry)
 *   - tmp-data/product_variants.json    (alleen bij nieuwe entry — default variant)
 *   - tmp-data/product_categories.json  (alleen bij nieuwe entry, als categorie matched)
 *   - public/products/<websiteId>.<ext> (alleen als CRM een foto heeft)
 *
 * Na de commit:
 *   - websiteProductId wordt naar de CRM geschreven
 *   - revalidatePath('/products') zodat de UI direct klopt
 *
 * Vercel-deploy van habitat-one wordt automatisch getriggerd door de push.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { fetchProductImageBytes } from "@/lib/storage";
import { translateText, type Locale } from "@/lib/translate";
import { commitFiles, getTextFile, GithubSyncDisabledError, websiteRepo } from "./github-client";

interface WebsiteProduct {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  /** Vertalingen per locale (NL/DE/EN/ES) — geschreven door pushProductToWebsite. */
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
  /** Alternatieve maten — strings zoals "2400 × 590 mm". */
  additional_sizes?: string[] | null;
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

function extFromContentType(ct: string): string {
  if (/png/.test(ct)) return "png";
  if (/webp/.test(ct)) return "webp";
  if (/avif/.test(ct)) return "avif";
  return "jpg";
}

export interface PushResult {
  ok: true;
  websiteProductId: number;
  action: "created" | "updated";
  commitSha: string;
  commitUrl: string;
  message: string;
}

export async function pushProductToWebsite(productId: string): Promise<PushResult> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) throw new Error("Product niet gevonden.");
  if (!product.sku) throw new Error("Product heeft geen SKU — kies eerst een SKU (bv. via inkooporder).");

  // 1. Huidige website-JSON laden
  const [productsFile, variantsFile, categoriesFile, prodCatsFile] = await Promise.all([
    getTextFile("tmp-data/products.json"),
    getTextFile("tmp-data/product_variants.json"),
    getTextFile("tmp-data/categories.json"),
    getTextFile("tmp-data/product_categories.json"),
  ]);
  if (!productsFile || !variantsFile || !categoriesFile || !prodCatsFile) {
    throw new GithubSyncDisabledError();
  }
  const websiteProducts: WebsiteProduct[] = JSON.parse(productsFile.text);
  const websiteVariants: WebsiteVariant[] = JSON.parse(variantsFile.text);
  const categories: WebsiteCategory[] = JSON.parse(categoriesFile.text);
  const prodCats: ProductCategoryRow[] = JSON.parse(prodCatsFile.text);

  const skuKey = normSku(product.sku);
  const existingIdx = websiteProducts.findIndex((p) => normSku(p.sku) === skuKey);
  let entry: WebsiteProduct;
  let action: "created" | "updated";
  const filesToCommit: Array<{ path: string; content: string | Uint8Array }> = [];
  const newVariants = [...websiteVariants];
  const newProdCats = [...prodCats];

  const nextW = num(product.widthMm);
  const nextH = num(product.heightMm);
  const nextL = num(product.lengthMm);
  const nextT = num(product.thicknessMm);
  const nowIso = new Date().toISOString();

  // Auto-vertaal de omschrijving naar de andere 3 talen (best-effort).
  // We gaan ervan uit dat de bron NL is; valt stilletjes terug als OpenAI faalt.
  let translatedDesc: Partial<Record<Locale, string>> | null = null;
  if (product.description?.trim() && process.env.OPENAI_API_KEY) {
    try {
      const out = await translateText({
        text: product.description,
        fromLocale: "nl",
        targetLocales: ["de", "en", "es"],
      });
      translatedDesc = { nl: product.description, ...out };
    } catch {
      translatedDesc = { nl: product.description };
    }
  } else if (product.description?.trim()) {
    translatedDesc = { nl: product.description };
  }

  const extraSizes = (product.additionalSizes as string[] | null) ?? null;

  if (existingIdx >= 0) {
    // Update
    entry = { ...websiteProducts[existingIdx] };
    entry.name = product.name;
    if (product.description) entry.description = product.description;
    if (translatedDesc) entry.description_i18n = translatedDesc;
    if (extraSizes !== null) entry.additional_sizes = extraSizes;
    if (nextW != null) entry.width = nextW;
    if (nextH != null) entry.height = nextH;
    if (nextL != null) entry.length = nextL;
    if (nextT != null) entry.thickness = nextT;
    entry.dimension_unit = "mm";
    websiteProducts[existingIdx] = entry;
    action = "updated";
  } else {
    // Nieuw
    const nextId = websiteProducts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    entry = {
      id: nextId,
      name: product.name,
      slug: `${slugify(product.name) || `product-${nextId}`}-${Date.now()}`,
      description: product.description ?? null,
      description_i18n: translatedDesc,
      short_description: null,
      sku: product.sku,
      thumbnail_path: null,
      featured: false,
      width: nextW,
      height: nextH,
      length: nextL,
      thickness: nextT,
      dimension_unit: "mm",
      additional_sizes: extraSizes,
      coverage_value: null,
      coverage_unit: null,
      stock_unit: "Pcs",
    };
    websiteProducts.push(entry);

    // Default variant
    const nextVariantId = newVariants.reduce((m, v) => Math.max(m, v.id), 0) + 1;
    newVariants.push({
      id: nextVariantId,
      product_id: entry.id,
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

    // Categorie matchen op naam
    const catName = (product.category ?? product.collection ?? "").trim();
    const matchedCat = catName
      ? categories.find((c) => normName(c.name) === normName(catName))
      : undefined;
    if (matchedCat) {
      const nextRowId = newProdCats.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      newProdCats.push({
        id: nextRowId,
        product_id: entry.id,
        category_id: matchedCat.id,
        is_primary: true,
        created_at: nowIso,
      });
    }
    action = "created";
  }

  // 2. Foto: als de CRM een imageUrl heeft, binary ophalen en committen.
  if (product.imageUrl) {
    const img = await fetchProductImageBytes(product.imageUrl);
    if (img) {
      const ext = extFromContentType(img.contentType);
      const fileName = `${entry.id}.${ext}`;
      entry.thumbnail_path = fileName;
      filesToCommit.push({
        path: `public/products/${fileName}`,
        content: img.bytes,
      });
      // Update entry in-place (we hebben 'm hierboven al in websiteProducts gezet,
      // dus thumbnail_path wijziging tikt door bij JSON.stringify).
      if (existingIdx >= 0) websiteProducts[existingIdx] = entry;
      else websiteProducts[websiteProducts.length - 1] = entry;
    }
  }

  // 3. JSON-bestanden vol stoppen
  filesToCommit.push({
    path: "tmp-data/products.json",
    content: JSON.stringify(websiteProducts, null, 2) + "\n",
  });
  if (action === "created") {
    filesToCommit.push({
      path: "tmp-data/product_variants.json",
      content: JSON.stringify(newVariants, null, 2) + "\n",
    });
    if (newProdCats.length !== prodCats.length) {
      filesToCommit.push({
        path: "tmp-data/product_categories.json",
        content: JSON.stringify(newProdCats, null, 2) + "\n",
      });
    }
  }

  // 4. Atomic commit
  const commit = await commitFiles({
    message:
      action === "created"
        ? `feat(products): add ${product.sku} (${product.name})`
        : `chore(products): update ${product.sku} (${product.name})`,
    files: filesToCommit,
  });

  // 5. websiteProductId terugschrijven
  await db
    .update(products)
    .set({ websiteProductId: entry.id, updatedAt: new Date() })
    .where(eq(products.id, productId));

  return {
    ok: true,
    websiteProductId: entry.id,
    action,
    commitSha: commit.commitSha,
    commitUrl: commit.commitUrl,
    message: `${action === "created" ? "Aangemaakt op" : "Bijgewerkt op"} ${websiteRepo}. Vercel-deploy van de website start nu vanzelf.`,
  };
}
