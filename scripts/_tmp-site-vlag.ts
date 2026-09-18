import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ id: products.id, name: products.name, category: products.category, push: products.pushToWebsite, wid: products.websiteProductId }).from(products).where(eq(products.brandId, merk.id)).orderBy(products.category, products.name);
  const per = new Map<string, { n: number; push: number }>();
  for (const r of rows) { const e = per.get(r.category ?? "?") ?? { n: 0, push: 0 }; e.n++; if (r.push) e.push++; per.set(r.category ?? "?", e); }
  console.log([...per.entries()].map(([c, e]) => `${c}: ${e.n} (op site: ${e.push})`).join("\n"));
  for (const cat of ["Douchewanden", "Accessoires", "Douchegoten", "Douchebakken", "Overig"]) {
    console.log(`--- ${cat}:`, rows.filter((r) => r.category === cat).map((r) => r.name).join(" | "));
  }
  process.exit(0);
}
main();
