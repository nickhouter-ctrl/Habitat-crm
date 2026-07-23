/**
 * Voor de NIEUWE (niet-op-voorraad) wandpanelen uit de distributeur-lijst met een
 * te lage marge (<65%): til de adviesprijs op naar 65% marge, per maat, afgerond
 * op € X,95 incl btw. Alleen verhogen, nooit verlagen; trade-prijs beweegt mee.
 *
 * BELANGRIJK: panelen die we AL OP VOORRAAD hebben (stockQty>0 of een maat met
 * inStock=true) worden NIET aangeraakt — hun huidige prijzen blijven staan.
 * De dure uitschieters (OP_AANVRAAG) worden op "op aanvraag" gezet (kostprijs
 * weg → vallen uit de brochure), want hun 65%-prijs is niet marktconform.
 *
 *   npx tsx scripts/raise-margin-newpanels.ts            (dry-run)
 *   npx tsx scripts/raise-margin-newpanels.ts --apply
 */
import "./load-env";
import { and, eq } from "drizzle-orm";

import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const MIN_MARGE = 0.65, VAT = 1.21, TRADE = 0.8;
const OP_AANVRAAG = ["Desert Stone", "Aerolite", "Dunhuang Stone"];
const r2 = (n: number) => Math.round(n * 100) / 100, r4 = (n: number) => Math.round(n * 10000) / 10000;
const e = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n));
const nice5 = (x: number) => Math.round(x / 5) * 5 - 0.05; // dichtstbijzijnde € X,95
const areaOf = (l: string) => { const m = String(l).match(/(\d{2,4})\D+(\d{2,4})/); return m ? (+m[1] * +m[2]) / 1e6 : null; };
function baseArea(r: { w: unknown; h: unknown; addl: unknown }) {
  const w = Number(r.w), h = Number(r.h); if (w > 0 && h > 0) return (w * h) / 1e6;
  const s = Array.isArray(r.addl) ? (r.addl as Array<{ label?: string }>) : []; let b = 0;
  for (const x of s) { const a = areaOf(x.label ?? ""); if (a && a > b) b = a; } return b || null;
}
const inStock = (r: { stock: unknown; addl: unknown }) =>
  Number(r.stock) > 0 || (Array.isArray(r.addl) && (r.addl as Array<{ inStock?: boolean }>).some((x) => x?.inStock === true));

async function main() {
  const rows = await db.select({ id: products.id, name: products.name, cat: products.category, w: products.widthMm, h: products.heightMm, cost: products.costEur, price: products.priceEur, trade: products.tradePriceEur, stock: products.stockQty, addl: products.additionalSizes })
    .from(products).where(and(eq(products.collection, "Wandpanelen"), eq(products.isActive, true)));

  let raised = 0, opaanvraag = 0; const lines: string[] = [];
  for (const r of rows) {
    const cost = Number(r.cost), price = Number(r.price), ba = baseArea(r);
    if (!(cost > 0 && price > 0) || !ba) continue;
    if (OP_AANVRAAG.includes(r.cat ?? "")) {
      opaanvraag++;
      if (APPLY) await db.update(products).set({ costEur: null, purchaseCostEur: null, updatedAt: new Date() }).where(eq(products.id, r.id));
      continue;
    }
    const marge = (price - cost) / price;
    if (marge >= MIN_MARGE) continue;         // al genoeg marge
    if (inStock(r)) continue;                  // VOORRAAD → niet aanraken

    const costM2 = cost / ba;
    const targetEx = (a: number) => r4(nice5((costM2 * a) / (1 - MIN_MARGE) * VAT) / VAT);
    const newBase = targetEx(ba);
    const newTrade = r2(newBase * TRADE);
    const addl = Array.isArray(r.addl) ? (r.addl as Array<{ label?: string; priceEur?: number }>) : [];
    const nextAddl = addl.map((s) => {
      const a = areaOf(s.label ?? ""); if (!a || s.priceEur == null) return s;
      const np = targetEx(a); return np > s.priceEur ? { ...s, priceEur: np } : s;
    });
    raised++;
    lines.push(`  ${String(r.cat).padEnd(26)} ${String(r.name).slice(0, 24).padEnd(25)} marge ${(marge * 100).toFixed(0)}% | advies ${e(price)} → ${e(newBase)} (${e(newBase * VAT)})`);
    if (APPLY) await db.update(products).set({ priceEur: String(newBase), tradePriceEur: String(newTrade), additionalSizes: nextAddl, updatedAt: new Date() }).where(eq(products.id, r.id));
  }
  console.log(lines.slice(0, 40).join("\n"));
  console.log(`\n${raised} nieuwe panelen → 65% marge | ${opaanvraag} panelen → op aanvraag (Desert/Aerolite/Dunhuang) | voorraad ongemoeid.`);
  console.log(APPLY ? "→ WEGGESCHREVEN." : "→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
