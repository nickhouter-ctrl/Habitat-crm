import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const idx = JSON.parse(readFileSync(`${S}/brauer-meubel-bestanden.json`, "utf8")) as Record<string, string[]>;
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, push: products.pushToWebsite }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const perMap = new Map<string, { inCrm: Set<string>; nieuw: string[]; codes: number }>();
  for (const [code, paden] of Object.entries(idx)) {
    const m = paden[0].match(/v09022026\/([^/]+)\/([^/]+)/); if (!m) continue;
    const key = m[1] === "Accessoires & Extra's" ? `${m[1]} › ${m[2]}` : m[1];
    const e = perMap.get(key) ?? { inCrm: new Set(), nieuw: [], codes: 0 }; e.codes++;
    const v = vars.find((x) => x.code === code);
    if (v) { const p = pm.get(v.productId)!; e.inCrm.add(`${p.name}${p.push ? " ✓site" : ""}`); } else e.nieuw.push(code);
    perMap.set(key, e);
  }
  for (const [k, e] of [...perMap.entries()].sort()) console.log(`${k}: ${e.codes} codes · in CRM als: ${[...e.inCrm].slice(0, 6).join(" | ") || "—"} · nieuw: ${e.nieuw.length}${e.nieuw.length ? ` (${e.nieuw.slice(0, 3).join(",")})` : ""}`);
  process.exit(0);
}
main();
