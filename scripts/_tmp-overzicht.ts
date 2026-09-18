import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
import { syncVariantProjection } from "@/lib/variants-sync";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, sub: products.subcategory, axes: products.optionAxes, push: products.pushToWebsite, img: products.imageUrl }).from(products).where(eq(products.brandId, merk.id)).orderBy(products.category, products.name);
  for (const p of prods) await syncVariantProjection(p.id);
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, options: productVariants.options, price: productVariants.priceEur }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const per = new Map<string, typeof vars>(); for (const v of vars) per.set(v.productId, [...(per.get(v.productId) ?? []), v]);
  const lines: string[] = [];
  for (const p of prods) {
    const vs = per.get(p.id) ?? [];
    const assen = (p.axes ?? []).map((a) => `${a.key}[${a.values.length}: ${a.values.map((w) => w.value).join("/")}]`).join(" ");
    const zonderOptie = vs.filter((v) => !v.options || Object.keys(v.options).length === 0).length;
    const prijzen = vs.map((v) => Number(v.price ?? 0)).filter((x) => x > 0);
    lines.push(`${p.push ? "SITE" : "crm "} | ${p.category} | ${p.name} | ${vs.length} uitv (${zonderOptie} zonder optie) | €${Math.min(...prijzen) || 0}-${Math.max(...prijzen) || 0} | ${assen}`);
  }
  require("node:fs").writeFileSync("/tmp/brauer-overzicht.txt", lines.join("\n"));
  console.log("projecties gesynct:", prods.length);
  process.exit(0);
}
main();
