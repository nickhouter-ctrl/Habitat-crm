import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, productVariants, products } from "@/lib/db/schema";

const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam: string; bron: string; prijs: number }>;

async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  console.log("merk", merk?.id, "dealerDiscountPct", merk?.dealerDiscountPct, "tradeDiscountPct", merk?.tradeDiscountPct);
  const prods = await db.select({ id: products.id, name: products.name, category: products.category, sub: products.subcategory, img: products.imageUrl }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ id: productVariants.id, code: productVariants.code, productId: productVariants.productId, price: productVariants.priceEur, list: productVariants.listPriceEur, img: productVariants.imageUrl }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  const crm = new Map(vars.map((v) => [v.code, v]));
  const inLijst = Object.keys(lijst);
  const match = inLijst.filter((c) => crm.has(c));
  const nieuw = inLijst.filter((c) => !crm.has(c));
  const zonderPrijs = vars.filter((v) => !lijst[v.code]);
  console.log(`producten ${prods.length}, variants ${vars.length}, met foto ${vars.filter((v) => v.img).length}`);
  console.log(`prijscodes ${inLijst.length}: match ${match.length}, nieuw ${nieuw.length}; crm-codes zonder prijs ${zonderPrijs.length}`);
  const perProduct = new Map<string, number>();
  for (const v of zonderPrijs) perProduct.set(v.productId, (perProduct.get(v.productId) ?? 0) + 1);
  const pm = new Map(prods.map((p) => [p.id, p]));
  console.log("-- producten met meeste variants zonder prijs:");
  [...perProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([pid, n]) => console.log(n, pm.get(pid)?.name, "|", pm.get(pid)?.category));
  console.log("-- nieuwe codes, per naam-stam (eerste 40):");
  const stam = new Map<string, string[]>();
  for (const c of nieuw) { const n = (lijst[c].naam ?? "").replace(/\s+(chroom|mat zwart|geborsteld [a-z]+|gunmetal|koper|goud|rvs)\b.*$/i, ""); stam.set(n, [...(stam.get(n) ?? []), c]); }
  [...stam.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 40).forEach(([n, cs]) => console.log(cs.length, n, "|", cs.slice(0, 3).join(",")));
  console.log("-- aantal stammen:", stam.size);
  process.exit(0);
}
main();
