import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const r = await db.update(products).set({ category: "Douchesets", updatedAt: new Date() }).where(and(eq(products.brandId, merk.id), eq(products.category, "Douches"))).returning({ id: products.id });
  console.log(`Douches → Douchesets: ${r.length}`);
  process.exit(0);
}
main();
