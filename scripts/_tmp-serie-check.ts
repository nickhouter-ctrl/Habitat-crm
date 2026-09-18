import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string; prijs?: number }>;
const serie = (n: string) => (/\bCarving\b/i.test(n) ? "Carving" : /\bStripe\b/i.test(n) ? "Stripe" : /\bEdition\b/i.test(n) ? "Edition" : null);
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, push: products.pushToWebsite }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, price: productVariants.priceEur, list: productVariants.listPriceEur }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  const per = new Map<string, Map<string, number>>();
  for (const v of vars) { const n = lijst[v.code]?.naam; if (!n || !/^5-/.test(v.code)) continue; const s = serie(n) ?? "—"; const m = per.get(v.productId) ?? new Map(); m.set(s, (m.get(s) ?? 0) + 1); per.set(v.productId, m); }
  let n = 0;
  for (const [pid, m] of per) { if (m.size > 1) { n++; const p = pm.get(pid)!; console.log(`${p.push ? "SITE" : "crm "} ${p.name}: ${[...m.entries()].map(([s, c]) => `${s} ${c}`).join(", ")}`); } }
  console.log("producten met gemengde series:", n);
  // prijs-steekproef
  for (const c of ["5-CE-001", "5-GK-003-R4", "GS-VOI1H80200MZ", "DR-MRF70S"]) { const v = vars.find((x) => x.code === c); console.log(c, "advies", lijst[c]?.prijs, "lijst", v?.list, "verkoop ex", v?.price, "incl", v ? Math.round(Number(v.price) * 1.21 * 100) / 100 : null); }
  process.exit(0);
}
main();
