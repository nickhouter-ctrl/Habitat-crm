import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products, productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { naam?: string }>;
async function main() {
  const [merk] = await db.select().from(brands).where(eq(brands.slug, "brauer"));
  const prods = await db.select({ id: products.id, name: products.name, axes: products.optionAxes }).from(products).where(eq(products.brandId, merk.id));
  const vars = await db.select({ productId: productVariants.productId, code: productVariants.code, options: productVariants.options }).from(productVariants).where(eq(productVariants.brandId, merk.id));
  for (const naam of ["Edition Thermostatische inbouw regendouche", "Carving Thermostatische inbouw regendouche"]) {
    const p = prods.find((x) => x.name === naam)!; const vs = vars.filter((v) => v.productId === p.id);
    const per = new Map<string, string[]>(); for (const v of vs) { const k = String(v.options?.bediening); per.set(k, [...(per.get(k) ?? []), v.code]); }
    console.log(naam);
    for (const [k, codes] of per) { const nrs = [...new Set(codes.map((c) => c.replace(/^5-[A-Z]+-/, "").replace(/-.*$/, "")))]; console.log(`  ${k}: ${codes.length} — nummers ${nrs.join(",")} — bv ${lijst[codes[0]]?.naam?.slice(0, 90)}`); }
  }
  console.log("\n--- maat/lengte-problemen:");
  for (const p of prods) {
    const keys = (p.axes ?? []).map((a) => a.key);
    const maat = (p.axes ?? []).find((a) => a.key === "maat");
    const raar = maat?.values.filter((w) => /NaN|^\d{3,}x|x\d{3,}|^\d{3,} cm$/.test(w.value)).map((w) => w.value) ?? [];
    if ((keys.includes("lengte") && keys.includes("maat")) || raar.length) console.log(`${p.name}: assen ${keys.join(",")}${raar.length ? ` · rare maten: ${raar.join(" / ")}` : ""}`);
  }
  process.exit(0);
}
main();
