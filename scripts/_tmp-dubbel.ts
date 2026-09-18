import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const houden = JSON.parse(readFileSync(`${S}/brauer-extra-houden.json`, "utf8")) as Record<string, number[]>;
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const vars = await db.select({ id: productVariants.id, code: productVariants.code, images: productVariants.images }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  let n = 0;
  for (const v of vars) {
    if (!v.images?.length || !(v.code in houden)) continue;
    const ok = new Set(houden[v.code].map((i) => `brauer/${v.code}_${i}.jpg`));
    const nieuw = v.images.filter((u) => ok.has(u.split("/product-images/")[1] ?? ""));
    if (nieuw.length !== v.images.length) { n++; await db.update(productVariants).set({ images: nieuw.length ? nieuw : null }).where(eq(productVariants.id, v.id)); }
  }
  console.log(`dubbele extra foto's verwijderd bij ${n} uitvoeringen`);
  process.exit(0);
}
main();
