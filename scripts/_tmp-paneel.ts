import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const [p] = await db.select().from(products).where(and(eq(products.brandId, merk.id), eq(products.name, "Edition Douchepaneel")));
  const vs = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
  let n = 0;
  for (const v of vs) {
    if (!v.imageUrl || !v.images?.length) continue;
    // sfeerbeeld (eerste extra) voorop, packshot daarna
    const [sfeer, ...rest] = v.images;
    await db.update(productVariants).set({ imageUrl: sfeer, images: [v.imageUrl, ...rest] }).where(eq(productVariants.id, v.id)); n++;
  }
  const assen = (p.optionAxes ?? []).map((a) => a.key === "kleur" ? { ...a, values: a.values.map((w) => { const v = vs.find((x) => x.options?.kleur === w.value); return v?.images?.[0] ? { ...w, imageUrl: v.images[0] } : w; }) } : a);
  const rep = vs.find((v) => v.options?.kleur === "Chroom") ?? vs[0];
  await db.update(products).set({ imageUrl: rep?.images?.[0] ?? p.imageUrl, optionAxes: assen, updatedAt: new Date() }).where(eq(products.id, p.id));
  console.log(`douchepaneel: sfeerbeeld voorop bij ${n} uitvoeringen`);
  process.exit(0);
}
main();
