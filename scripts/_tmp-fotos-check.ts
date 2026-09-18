import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, img: products.imageUrl, push: products.pushToWebsite }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, img: productVariants.imageUrl }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const per = new Map<string, { n: number; foto: number; codes: string[] }>();
  for (const v of vars) { const e = per.get(v.productId) ?? { n: 0, foto: 0, codes: [] }; e.n++; if (v.img) e.foto++; else e.codes.push(v.code); per.set(v.productId, e); }
  const zonder = prods.filter((p) => p.push && !p.img);
  console.log(`op site zonder productfoto: ${zonder.length}`);
  for (const p of zonder) { const e = per.get(p.id); console.log(`- ${p.name} [${p.category}] varianten ${e?.n} met foto ${e?.foto} vb ${e?.codes.slice(0, 3).join(",")}`); }
  const dk = prods.filter((p) => p.category === "Douchekranen" && p.push);
  console.log(`Douchekranen op site: ${dk.length}, met productfoto ${dk.filter((p) => p.img).length}`);
  process.exit(0);
}
main();
