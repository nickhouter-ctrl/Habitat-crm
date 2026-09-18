/** Tijdelijk: de Brauer-producten lokaal in de website-repo zetten om te bekijken. */
import { readFileSync, writeFileSync } from "node:fs";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { productVariants, products } from "@/lib/db/schema";

const SITE = "/Users/nickhouter/projects/Habitat-one";

const slugify = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

async function main() {
  const rijen = await db
    .select()
    .from(products)
    .where(and(isNotNull(products.brandId), eq(products.pushToWebsite, true)))
    .orderBy(asc(products.name));

  const bestaand = JSON.parse(readFileSync(`${SITE}/tmp-data/products.json`, "utf8")) as Array<
    Record<string, unknown>
  >;
  const zonderBrauer = bestaand.filter((p) => p.brand !== "brauer");
  // Website-id per sku vasthouden: anders verandert elke export alle slugs/URL's.
  const idPerSku = new Map(bestaand.filter((p) => p.brand === "brauer" && p.sku).map((p) => [String(p.sku), Number(p.id)]));
  let volgendId = bestaand.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1;

  const opties: unknown[] = [];
  const nieuw: Array<Record<string, unknown>> = [];

  for (const p of rijen) {
    const v0 = await db.select({ sku: productVariants.sku }).from(productVariants).where(eq(productVariants.productId, p.id));
    const skuExport = v0.length === 1 && v0[0].sku ? v0[0].sku : p.sku; // zelfde sleutel als in de export, anders verspringt het id
    const websiteId = idPerSku.get(String(skuExport)) ?? idPerSku.get(String(p.sku)) ?? volgendId++;
    const v = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, p.id))
      .orderBy(asc(productVariants.sortOrder));
    if (v.length === 0) continue;

    const categorie = (p.category ?? "").toLowerCase();
    nieuw.push({
      id: websiteId,
      name: p.name,
      slug: `${slugify(p.name)}-${websiteId}`,
      sku: v.length === 1 && v[0].sku ? v[0].sku : p.sku, // één uitvoering: haar eigen artikelnummer
      description: p.description ?? null,
      description_i18n: p.descriptionI18n ?? null,
      short_description: null,
      thumbnail_path: null,
      featured: false,
      stock_unit: "Pcs",
      brand: "brauer",
      series: p.subcategory ?? null,
      product_type: p.category ?? null,
      image_url: p.imageUrl ?? null,
      availability: p.availability ?? null, // "stock" = uit voorraad, sneller te leveren
      collection: categorie.includes("meubel")
        ? "furniture"
        : categorie.includes("accessoire")
          ? "accessories"
          : "bathroom",
    });

    const assen = (p.optionAxes ?? []).filter((as) =>
      v.some((x) => (x.options as Record<string, string>)?.[as.key]),
    );
    // ook zonder assen (één uitvoering): één combinatie, zodat extra foto's en tekening meegaan
    if (assen.length || v.length === 1) {
      opties.push({
        product_id: websiteId,
        axes: assen.map((as) => ({
          key: as.key,
          label: as.label,
          values: as.values.map((w) => ({ value: w.value, label: w.label, image: w.imageUrl ?? null })),
        })),
        combinations: v
          .filter((x) => x.isActive && x.sku)
          .map((x) => ({ sku: x.sku, options: x.options ?? {}, image: x.imageUrl ?? null, images: x.images?.length ? x.images : null, drawing: typeof x.specs?.tekening === "string" ? x.specs.tekening : null, drawingImage: typeof x.specs?.tekeningAfbeelding === "string" ? x.specs.tekeningAfbeelding : null })),
      });
    }
  }

  writeFileSync(`${SITE}/tmp-data/products.json`, JSON.stringify([...zonderBrauer, ...nieuw], null, 2));
  writeFileSync(`${SITE}/tmp-data/product_options.json`, JSON.stringify(opties, null, 2));
  console.log(`${nieuw.length} producten en ${opties.length} optieblokken lokaal geplaatst`);
  process.exit(0);
}

main();
