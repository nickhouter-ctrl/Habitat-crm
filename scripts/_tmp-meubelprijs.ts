/** Meubelprijzen uit de catalogus (bron "meubel p…") op dezelfde regel als kranen/glas: lijst = advies ex, verkoop = nette prijs incl., inkoop = 50%. */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { productVariants } from "@/lib/db/schema";
const TOEPASSEN = process.argv.includes("--toepassen");
const BTW = 21, KORTING = 50;
const inkoop = (a: number) => Math.round(a * (1 - KORTING / 100) * 100) / 100;
const nettePrijs = (a: number) => { const incl = a * (1 + BTW / 100); const stap = incl < 100 ? 1 : incl < 1000 ? 5 : 10; const n = Math.ceil(incl / stap - 1e-9) * stap; return Math.round((n / (1 + BTW / 100)) * 100) / 100; };
async function main() {
  const rows = await db.execute(sql`select v.id, v.code, v.list_price_eur lijst, v.price_eur prijs, v.purchase_cost_eur inkoop from product_variants v join products p on p.id=v.product_id join brands b on b.id=p.brand_id
    where b.slug='brauer' and v.source_ref like 'meubel p%' and v.list_price_eur is not null and v.list_price_eur::numeric > 0`) as unknown as { id: string; code: string; lijst: string; prijs: string; inkoop: string | null }[];
  let n = 0, al = 0;
  for (const r of rows) {
    const advies = Number(r.lijst); const nieuw = nettePrijs(advies);
    if (Number(r.prijs) === nieuw && r.inkoop != null && Number(r.inkoop) === inkoop(advies)) { al++; continue; }
    if (n < 5) console.log(`${r.code}: advies ${advies} → verkoop ${nieuw} (incl ${Math.round(nieuw * 1.21)}), inkoop ${inkoop(advies)}`);
    n++;
    if (TOEPASSEN) await db.update(productVariants).set({ priceEur: String(nieuw), listPriceEur: String(advies), discountPct: String(KORTING), purchaseCostEur: String(inkoop(advies)), costEur: String(inkoop(advies)), updatedAt: new Date() }).where(eq(productVariants.id, r.id));
  }
  console.log(`${rows.length} meubeluitvoeringen met catalogusprijs · ${n} aangepast, ${al} al goed` + (TOEPASSEN ? " — gedaan" : " (droogloop)"));
  process.exit(0);
}
main();
