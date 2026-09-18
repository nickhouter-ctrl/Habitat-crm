import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants, type ProductOptionAxis } from "@/lib/db/schema";
import { buildVariantLabel } from "@/lib/variants";
import { syncVariantProjection } from "@/lib/variants-sync";

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select().from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select().from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));

  // 1. DR-…CF-uitvoeringen (nieuwe kleur Coffee) bij hun bestaande douchegoot-product
  const stam = (code: string) => code.match(/^(DR-[A-Z]+\d+)(CF|CE|S|GG|GK|GM|NG)$/)?.[1] ?? null;
  const perStam = new Map<string, string>();
  for (const v of vars) { const s = stam(v.code); if (s && pm.get(v.productId)?.category === "Douchegoten") perStam.set(s, v.productId); }
  const verplaatst = new Set<string>(); const leeg = new Set<string>();
  for (const v of vars) {
    const s = stam(v.code); if (!s || !v.code.endsWith("CF")) continue;
    const doel = perStam.get(s); if (!doel || doel === v.productId) continue;
    const product = pm.get(doel)!; const broer = vars.find((b) => b.productId === doel && stam(b.code) === s)!;
    const options = { ...(broer.options ?? {}), kleur: "Coffee" };
    const assen: ProductOptionAxis[] = (product.optionAxes ?? []).map((a) => ({ ...a, values: [...a.values] }));
    const ka = assen.find((a) => a.key === "kleur"); if (ka && !ka.values.some((w) => w.value === "Coffee")) ka.values.push({ value: "Coffee", label: "Coffee" });
    await db.update(products).set({ optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, doel)); product.optionAxes = assen;
    await db.update(productVariants).set({ productId: doel, options, label: buildVariantLabel(assen, options) || v.code, updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    leeg.add(v.productId); verplaatst.add(doel); console.log(`${v.code} → ${product.name}`);
  }
  for (const id of leeg) {
    const [{ n }] = await db.select({ n: productVariants.id }).from(productVariants).where(eq(productVariants.productId, id)).limit(1).then((r) => (r.length ? [{ n: 1 }] : [{ n: 0 }]));
    if (!n) { await db.delete(products).where(eq(products.id, id)); console.log(`leeg product weg: ${pm.get(id)?.name}`); }
  }
  for (const id of verplaatst) await syncVariantProjection(id);

  // 2. Douchekranen heet Douches (complete douchesets)
  const r = await db.update(products).set({ category: "Douches", updatedAt: new Date() }).where(and(eq(products.brandId, merk.id), eq(products.category, "Douchekranen"))).returning({ id: products.id });
  console.log(`Douchekranen → Douches: ${r.length}`);

  // 3. zonder enige foto: niet op de site tot Brauer beelden levert
  const vars2 = await db.select({ productId: productVariants.productId, img: productVariants.imageUrl }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const metFoto = new Set(vars2.filter((v) => v.img).map((v) => v.productId));
  const prods2 = await db.select({ id: products.id, name: products.name, push: products.pushToWebsite, img: products.imageUrl }).from(products).where(eq(products.brandId, merk.id));
  const uit = prods2.filter((p) => p.push && !p.img && !metFoto.has(p.id));
  if (uit.length) await db.update(products).set({ pushToWebsite: false, updatedAt: new Date() }).where(inArray(products.id, uit.map((p) => p.id)));
  console.log(`zonder foto van de site: ${uit.length}`);
  process.exit(0);
}
main();
