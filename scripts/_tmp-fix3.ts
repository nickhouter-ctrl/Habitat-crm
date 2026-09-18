/** Bediening uit de prijslijstnaam, maten herstellen (NaN/mm), dubbele maat-as weg. */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
function bediening(naam: string): string | null {
  const m = naam.match(/inbouw regendouche\s*(.*?)\s*SET\s*\d+/i);
  if (!m) return null;
  const k = m[1].trim().toLowerCase();
  if (k === "") return "Stopkranen (losse knoppen)";
  if (k === "met drukknoppen") return "Drukknoppen";
  if (k === "3-weg rechthoekig") return "3-weg omstel, rechthoekige plaat";
  if (k === "3-weg rond") return "3-weg omstel, ronde plaat";
  return null;
}
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, axes: products.optionAxes }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ id: productVariants.id, productId: productVariants.productId, code: productVariants.code, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const pm = new Map(prods.map((p) => [p.id, p]));
  let nB = 0, nM = 0, nL = 0;
  for (const v of vars) {
    const o = { ...(v.options ?? {}) }; const p = pm.get(v.productId);
    const naam = lijst[v.code]?.naam ?? "";
    const b = bediening(naam); if (b && o.bediening !== b) { o.bediening = b; nB++; }
    if (o.maat === "NaN cm") { const d = v.code.match(/(\d{2,3})(?:[A-Z]{1,2})?$/)?.[1]; if (d) { o.maat = `${d} cm`; nM++; } else delete o.maat; }
    if (p?.category === "Douchekoppen" && /^\d{3} cm$/.test(o.maat ?? "")) { o.maat = `${Number(o.maat!.replace(" cm", "")) / 10} cm`; nM++; }
    if (o.maat && /mm/i.test(naam) && /^\d{3,}x\d{3,}/.test(o.maat)) { o.maat = o.maat.replace(/(\d+)/g, (n) => String(Number(n) / 10)); nM++; }
    if (o.lengte && o.maat) { delete o.maat; nL++; }
    if (JSON.stringify(o) !== JSON.stringify(v.options ?? {})) await db.update(productVariants).set({ options: o }).where(eq(productVariants.id, v.id));
  }
  console.log(`bediening: ${nB}, maten hersteld: ${nM}, dubbele maat weg: ${nL}`);
  process.exit(0);
}
main();
