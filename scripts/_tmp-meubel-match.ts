import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const idx = JSON.parse(readFileSync(`${S}/brauer-meubel-bestanden.json`, "utf8")) as Record<string, string[]>;
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, price: productVariants.priceEur, img: productVariants.imageUrl }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const meubel = vars.filter((v) => pm.get(v.productId)?.category === "Badkamermeubels");
  const met = meubel.filter((v) => idx[v.code]);
  console.log(`meubel-uitvoeringen in CRM: ${meubel.length}, met bestanden in pakket: ${met.length}, zonder: ${meubel.length - met.length}`);
  console.log("zonder (vb):", meubel.filter((v) => !idx[v.code]).slice(0, 8).map((v) => v.code).join(", "));
  const crmCodes = new Set(vars.map((v) => v.code));
  const nieuw = Object.keys(idx).filter((c) => !crmCodes.has(c));
  const perPrefix = new Map<string, number>(); for (const c of nieuw) perPrefix.set(c.split("-")[0], (perPrefix.get(c.split("-")[0]) ?? 0) + 1);
  console.log(`pakketcodes niet in CRM: ${nieuw.length}`, Object.fromEntries(perPrefix));
  console.log("meubelproducten:", prods.filter((p) => p.category === "Badkamermeubels").map((p) => p.name).join(" | "));
  process.exit(0);
}
main();
