/** De handdouches zijn twee echte producten (staaf / 3-standen), geen keuze binnen één product. */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { productSku } from "@/lib/import/product-import";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const [p] = await db.select().from(products).where(eq(products.brandId, merk.id)).then((r) => r.filter((x) => x.category === "Handdouches" && x.name === "Handdouche"));
  if (!p) { console.log("geen samengevoegd handdouche-product"); process.exit(0); }
  const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
  const staaf = vs.filter((v) => v.options?.handdouche === "Staafmodel");
  const drie = vs.filter((v) => v.options?.handdouche === "3-standen");
  const kleurAs = (gv: typeof vs): ProductOptionAxis[] => [{ key: "kleur", label: "Kleur", values: [...new Set(gv.map((v) => v.options?.kleur).filter(Boolean))].sort().map((w) => ({ value: w!, label: w! })) }];
  const zet = async (id: string, gv: typeof vs, assen: ProductOptionAxis[]) => {
    for (const v of gv) { const o = { ...(v.options ?? {}) }; delete o.handdouche; await db.update(productVariants).set({ productId: id, options: o, label: buildVariantLabel(assen, o) || v.code }).where(eq(productVariants.id, v.id)); }
    await syncVariantProjection(id);
  };
  const asStaaf = kleurAs(staaf); const asDrie = kleurAs(drie);
  await db.update(products).set({ name: "Staaf handdouche", optionAxes: asStaaf, imageUrl: null, updatedAt: new Date() }).where(eq(products.id, p.id));
  await zet(p.id, staaf, asStaaf);
  const [nieuw] = await db.insert(products).values({ name: "3-standen handdouche", sku: productSku(merk.skuPrefix ?? "BRA", null, "3-standen handdouche"), brandId: merk.id, category: p.category, collection: p.collection, unit: p.unit, optionAxes: asDrie, pushToWebsite: p.pushToWebsite, availability: p.availability }).returning({ id: products.id });
  await zet(nieuw.id, drie, asDrie);
  console.log(`Staaf handdouche ${staaf.length}, 3-standen handdouche ${drie.length}`);
  process.exit(0);
}
main();
