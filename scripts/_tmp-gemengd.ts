import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, axes: products.optionAxes, push: products.pushToWebsite }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  let n = 0;
  for (const p of prods) {
    const assen = (p.axes ?? []).map((a) => a.key).filter((k) => k !== "kleur");
    const vs = vars.filter((v) => v.productId === p.id);
    const stam = (c: string) => c.replace(/^5-[A-Z]{1,2}-/, "").replace(/^([A-Z]+-[A-Z]+?\d*)(CF|CE|S|GG|GK|GM|NG)$/, "$1");
    const stammen = new Map<string, string[]>();
    for (const v of vs) { const s = stam(v.code); stammen.set(s, [...(stammen.get(s) ?? []), v.code]); }
    if (stammen.size <= 1) continue;
    // hoeveel stammen blijven over als de niet-kleur-assen de verschillen verklaren?
    const perOpties = new Map<string, Set<string>>();
    for (const v of vs) { const k = assen.map((a) => v.options?.[a] ?? "").join("|"); perOpties.set(k, (perOpties.get(k) ?? new Set()).add(stam(v.code))); }
    const verdacht = [...perOpties.values()].some((s) => s.size > 1);
    if (!verdacht) continue;
    n++;
    const namen = [...stammen.entries()].map(([s, codes]) => `${s}(${codes.length}): ${(lijst[codes[0]]?.naam ?? "?").replace(/^BRAUER /, "").slice(0, 60)}`);
    console.log(`${p.push ? "SITE" : "crm "} ${p.name} [${p.category}] assen=${assen.join(",") || "-"}\n    ${namen.join("\n    ")}`);
  }
  console.log("verdachte producten:", n);
  process.exit(0);
}
main();
