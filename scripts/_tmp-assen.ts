import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, axes: products.optionAxes, sku: products.sku }).from(products).where(eq(products.brandId, merk.id));
  const cats = new Map<string, number>(); for (const p of prods) cats.set(p.category ?? "?", (cats.get(p.category ?? "?") ?? 0) + 1);
  console.log("categorieën:", [...cats.entries()]);
  for (const cat of ["Douchewanden", "Douchegoten", "Accessoires", "Douchekranen"]) {
    const p = prods.find((x) => x.category === cat)!;
    const v = await db.select({ code: productVariants.code, options: productVariants.options, label: productVariants.label }).from(productVariants).where(eq(productVariants.productId, p.id)).limit(2);
    console.log(cat, "|", p.name, "|", p.sku, "| assen:", (p.axes ?? []).map((a) => `${a.key}(${a.values.length}: ${a.values.slice(0, 3).map((w) => w.value).join("/")})`).join(", "), "| vb:", JSON.stringify(v[0]));
  }
  const kleuren = new Set<string>(); for (const p of prods) for (const a of p.axes ?? []) if (a.key === "kleur") for (const w of a.values) kleuren.add(w.value);
  console.log("kleurwaarden CRM:", [...kleuren].join(" | "));
  process.exit(0);
}
main();
