/** Dubbele onderkasten (2xOK-…, breedte 200): prijs = 2 × de enkele kast in dezelfde kleur (catalogus: "200 = 2 x OK-AR100"). */
import { readFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
const S = "/private/tmp/claude-501/-Users-nickhouter-projects-Habitat-crm/0ea6e90a-f828-4936-a722-86b04f8d4dca/scratchpad";
const lijst = JSON.parse(readFileSync(`${S}/brauer-prijslijst.json`, "utf8")) as Record<string, { prijs?: number | string | null; status?: string | null }>;
const BTW = 21, KORTING = 50;
const netto = (a: number) => { const incl = a * (1 + BTW / 100); const stap = incl < 100 ? 1 : incl < 1000 ? 5 : 10; return Math.round((Math.ceil(incl / stap - 1e-9) * stap / (1 + BTW / 100)) * 100) / 100; };
async function main() {
  const vs = await db.select().from(productVariants).where(like(productVariants.code, "2%OK-%"));
  let n = 0, zonder = 0;
  for (const v of vs) {
    const enkel = lijst[v.code.replace(/^2[xX]OK-/, "OK-")]; const p = enkel?.prijs != null ? Number(enkel.prijs) : NaN;
    if (!Number.isFinite(p) || p <= 0) { zonder++; continue; }
    const advies = Math.round(p * 2 * 100) / 100;
    await db.update(productVariants).set({ listPriceEur: String(advies), priceEur: String(netto(advies)), discountPct: String(KORTING), purchaseCostEur: String(advies / 2), costEur: String(advies / 2), availability: /^uit voorraad leverbaar$/i.test(enkel.status ?? "") ? "stock" : "order_only", sourceRef: "meubel-prijslijst 2× enkele kast", updatedAt: new Date() }).where(eq(productVariants.id, v.id));
    n++;
  }
  console.log(`dubbele kasten: ${n} geprijsd (2× enkel), ${zonder} zonder enkele-kastprijs`);
  process.exit(0);
}
main();
