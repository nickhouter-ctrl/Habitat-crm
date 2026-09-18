import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const r = await db.update(products).set({ category: "Douchekranen", updatedAt: new Date() }).where(and(eq(products.brandId, merk.id), eq(products.category, "Douchepanelen"))).returning({ name: products.name });
  console.log(r);
  process.exit(0);
}
main();
