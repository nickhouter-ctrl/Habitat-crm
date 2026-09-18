import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
const KLEUR = /\b(PVD\s+)?(chroom|chrome|mat\s+zwart|zwart|black|goud(\s+geborsteld)?|gold|koper(\s+geborsteld)?|copper|gunmetal(\s+geborsteld)?|rvs(-kleurig)?(\s+geborsteld)?|brushed|geborsteld|coffee|wit)\b/gi;
export const schoon = (n: string) => n.replace(/^BRAUER\s+/i, "").replace(/\b\d{1,3}\s*[x×]\s*\d{2,3}\b/g, " ").replace(KLEUR, " ").replace(/\b(model [A-E]|links|rechts)\b/gi, " ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim().replace(/[,\-–]\s*$/, "").trim().toLowerCase();
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, push: products.pushToWebsite }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  let n = 0;
  for (const p of prods) {
    const groepen = new Map<string, string[]>();
    for (const v of vars.filter((v) => v.productId === p.id)) { const naam = lijst[v.code]?.naam; if (!naam) continue; const k = schoon(naam); groepen.set(k, [...(groepen.get(k) ?? []), v.code]); }
    if (groepen.size <= 1) continue;
    n++;
    console.log(`${p.push ? "SITE" : "crm "} ${p.name} [${p.category}]`);
    for (const [k, codes] of [...groepen.entries()].sort((a, b) => b[1].length - a[1].length)) console.log(`    ${codes.length}× ${k.slice(0, 90)}  (${codes[0]})`);
  }
  console.log("gemengde producten:", n);
  process.exit(0);
}
main();
