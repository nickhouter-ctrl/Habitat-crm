import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const rows = await db.select({ id: products.id, name: products.name, category: products.category }).from(products).where(and(eq(products.brandId, merk.id), ilike(products.name, "%douchebak%")));
  for (const r of rows) {
    await db.update(products).set({ category: "Douchebakken", updatedAt: new Date() }).where(eq(products.id, r.id));
    console.log(`${r.name}: ${r.category} → Douchebakken`);
  }
  process.exit(0);
}
main();
