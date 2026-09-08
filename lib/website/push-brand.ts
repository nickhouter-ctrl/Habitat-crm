"use server";

/**
 * Een merkproduct naar de website duwen, mét zijn keuzes.
 *
 * Bewust naast `push.ts` en niet erin: dat pad werkt al voor de ± 150
 * bestaande producten en schrijft per product één commit met één standaard
 * variant. Een merkartikel heeft tientallen uitvoeringen, en die horen in één
 * commit — anders bouwt de website zes keer voor één kraan.
 *
 * De keuzes gaan naar een EIGEN bestand (`tmp-data/product_options.json`).
 * Het bestaande `product_variants.json` kent maar één as, geen foto's, en
 * wordt door de andere push integraal herschreven; daar tientallen
 * combinaties in verbouwen is precies het risico dat we niet nemen.
 */
import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";
import { commitFiles, getTextFile, GithubSyncDisabledError } from "@/lib/website/github-client";

type WebsiteProduct = Record<string, unknown> & {
  id: number;
  name: string;
  slug: string;
  sku: string | null;
};

type OptieBlok = {
  product_id: number;
  axes: Array<{ key: string; label: string; values: Array<{ value: string; label: string; image?: string | null }> }>;
  combinations: Array<{ sku: string; options: Record<string, string>; image?: string | null }>;
};

const normSku = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");

const slugify = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

/** De collecties die de website kent; buiten deze lijst valt de site terug op
 *  zijn eigen naam-herkenning, en dan komt een kraan bij de accessoires. */
const WEBSITE_COLLECTIES = new Set(["bathroom", "accessories", "furniture"]);

/**
 * De collectie van het CRM vertalen naar die van de website.
 *
 * In het CRM staat een merkassortiment in zijn eigen collectie, zodat het de
 * eigen badkamercollectie niet overspoelt. Op de website hoort het gewoon bij
 * de badkamerproducten — daar is het merk een filter, geen aparte hoek.
 */
function collectieVoor(collection: string | null, category: string | null): string {
  const c = (collection ?? "").toLowerCase();
  const cat = (category ?? "").toLowerCase();
  if (cat.includes("accessoire") || c.includes("badkamer accessoire")) return "accessories";
  if (cat.includes("meubel") || c.includes("meubel")) return "furniture";
  return "bathroom";
}

export type MerkPushResultaat = {
  websiteProductId: number;
  actie: "aangemaakt" | "bijgewerkt";
  uitvoeringen: number;
  commitSha: string;
  commitUrl: string;
};

export async function pushBrandProductToWebsite(productId: string): Promise<MerkPushResultaat> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error("Product niet gevonden.");
  if (!product.sku) throw new Error("Product heeft geen productcode.");
  if (!product.brandId) throw new Error("Dit is geen merkproduct — gebruik de gewone website-push.");

  const merk = await db.query.brands.findFirst({ where: eq(brands.id, product.brandId) });
  const uitvoeringen = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sortOrder));

  const [productsFile, optionsFile] = await Promise.all([
    getTextFile("tmp-data/products.json"),
    getTextFile("tmp-data/product_options.json"),
  ]);
  if (!productsFile) throw new GithubSyncDisabledError();

  const websiteProducts: WebsiteProduct[] = JSON.parse(productsFile.text);
  // Het optiebestand mag nog niet bestaan — dan beginnen we het hier.
  const opties: OptieBlok[] = optionsFile ? JSON.parse(optionsFile.text) : [];

  const sleutel = normSku(product.sku);
  const idx = websiteProducts.findIndex((p) => normSku(p.sku) === sleutel);
  const collectie = collectieVoor(product.collection, product.category);
  if (!WEBSITE_COLLECTIES.has(collectie)) throw new Error(`Onbekende collectie "${collectie}".`);

  const velden = {
    name: product.name,
    sku: product.sku,
    description: product.description ?? null,
    description_i18n: product.descriptionI18n ?? null,
    brand: merk?.slug ?? null,
    series: product.subcategory ?? null,
    collection: collectie,
  };

  let websiteId: number;
  let actie: MerkPushResultaat["actie"];
  if (idx >= 0) {
    websiteProducts[idx] = { ...websiteProducts[idx], ...velden };
    websiteId = websiteProducts[idx].id;
    actie = "bijgewerkt";
  } else {
    websiteId = websiteProducts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    websiteProducts.push({
      id: websiteId,
      slug: `${slugify(product.name) || `product-${websiteId}`}`,
      thumbnail_path: null,
      featured: false,
      stock_unit: "Pcs",
      ...velden,
    });
    actie = "aangemaakt";
  }

  // De keuzes: alleen assen waarvan de uitvoeringen ook echt een waarde dragen.
  const assen = (product.optionAxes ?? []).filter((as) =>
    uitvoeringen.some((v) => (v.options as Record<string, string>)?.[as.key]),
  );
  const blok: OptieBlok = {
    product_id: websiteId,
    axes: assen.map((as) => ({
      key: as.key,
      label: as.label,
      values: as.values.map((w) => ({ value: w.value, label: w.label, image: w.imageUrl ?? null })),
    })),
    combinations: uitvoeringen
      .filter((v) => v.isActive && v.sku)
      .map((v) => ({
        sku: v.sku!,
        options: (v.options as Record<string, string>) ?? {},
        image: v.imageUrl ?? null,
      })),
  };
  const bestaandBlok = opties.findIndex((o) => o.product_id === websiteId);
  if (bestaandBlok >= 0) opties[bestaandBlok] = blok;
  else opties.push(blok);

  const commit = await commitFiles({
    message: `${actie === "aangemaakt" ? "feat" : "chore"}(catalogus): ${product.name} — ${blok.combinations.length} uitvoeringen`,
    files: [
      { path: "tmp-data/products.json", content: `${JSON.stringify(websiteProducts, null, 2)}\n` },
      { path: "tmp-data/product_options.json", content: `${JSON.stringify(opties, null, 2)}\n` },
    ],
  });

  await db
    .update(products)
    .set({ websiteProductId: websiteId, updatedAt: new Date() })
    .where(eq(products.id, productId));

  return {
    websiteProductId: websiteId,
    actie,
    uitvoeringen: blok.combinations.length,
    commitSha: commit.commitSha,
    commitUrl: commit.commitUrl,
  };
}
