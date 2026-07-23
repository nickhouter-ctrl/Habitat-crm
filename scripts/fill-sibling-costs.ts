/**
 * Vul de kostprijs van wandpaneel-kleurvarianten die er geen hebben, op basis van
 * de bekende inkoopprijs/m² van een broertje in dezelfde serie (categorie). Zo
 * komen in-voorraad series (Milan Travertine, Romanite, Linear Travertine…) mét
 * alle maten en een correcte prijs in de brochure — "zoals alle andere".
 * Alleen categorieën waar minstens één record al een kostprijs heeft (dus waar we
 * de inkoop/m² kennen); de volledig onbekende series blijven ongemoeid.
 *
 *   npx tsx scripts/fill-sibling-costs.ts            (dry-run)
 *   npx tsx scripts/fill-sibling-costs.ts --apply
 */
import "./load-env";
import { and, eq } from "drizzle-orm";

import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const COST_MULTIPLIER = 1.55;
const r2 = (n: number) => Math.round(n * 100) / 100;
const e = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n));

const areaOfLabel = (label: string) => {
  const m = String(label).match(/(\d{2,4})\D+(\d{2,4})/);
  return m ? (Number(m[1]) * Number(m[2])) / 1_000_000 : null;
};
function baseInfo(r: { w: unknown; h: unknown; addl: unknown }): { area: number | null; w: number | null; h: number | null } {
  const w = Number(r.w), h = Number(r.h);
  if (w > 0 && h > 0) return { area: (w * h) / 1_000_000, w, h };
  // grootste maat uit additionalSizes
  const sizes = Array.isArray(r.addl) ? (r.addl as Array<{ label?: string }>) : [];
  let best = 0, bw: number | null = null, bh: number | null = null;
  for (const s of sizes) {
    const m = String(s.label ?? "").match(/(\d{2,4})\D+(\d{2,4})/);
    if (!m) continue;
    const a = (Number(m[1]) * Number(m[2])) / 1_000_000;
    if (a > best) { best = a; bw = Math.max(+m[1], +m[2]); bh = Math.min(+m[1], +m[2]); }
  }
  return { area: best || null, w: bw, h: bh };
}

async function main() {
  const rows = await db
    .select({ id: products.id, sku: products.sku, name: products.name, cat: products.category, w: products.widthMm, h: products.heightMm, pur: products.purchaseCostEur, cost: products.costEur, price: products.priceEur, addl: products.additionalSizes })
    .from(products)
    .where(and(eq(products.collection, "Wandpanelen"), eq(products.isActive, true)));

  // Groepeer per categorie; bepaal de bekende inkoop/m² (mediaan) per serie.
  const byCat = new Map<string, typeof rows>();
  for (const r of rows) { const c = r.cat ?? "?"; if (!byCat.has(c)) byCat.set(c, []); byCat.get(c)!.push(r); }

  let changed = 0;
  const lines: string[] = [];
  for (const [cat, recs] of byCat) {
    const samples: number[] = [];
    for (const r of recs) {
      const pur = Number(r.pur) || (Number(r.cost) > 0 ? Number(r.cost) / COST_MULTIPLIER : 0);
      const { area } = baseInfo(r);
      if (pur > 0 && area) samples.push(pur / area);
    }
    if (!samples.length) continue; // volledig onbekende serie → laten
    samples.sort((a, b) => a - b);
    const perM2 = samples[Math.floor((samples.length - 1) / 2)];

    for (const r of recs) {
      if (Number(r.cost) > 0 || !(Number(r.price) > 0) || !r.sku) continue; // heeft al kost, of geen echte variant
      const { area, w, h } = baseInfo(r);
      if (!area) continue;
      const newPur = r2(perM2 * area);
      const newCost = r2(newPur * COST_MULTIPLIER);
      changed++;
      lines.push(`  ${cat.padEnd(24)} ${String(r.sku).padEnd(8)} ${String(r.name).slice(0, 26).padEnd(27)} €/m² ${perM2.toFixed(2)} · basis ${area.toFixed(2)}m² → inkoop ${e(newPur)} kost ${e(newCost)}`);
      if (APPLY) {
        const set: Record<string, unknown> = { purchaseCostEur: String(newPur), costEur: String(newCost), updatedAt: new Date() };
        if (!(Number(r.w) > 0) && w) set.widthMm = String(w);
        if (!(Number(r.h) > 0) && h) set.heightMm = String(h);
        await db.update(products).set(set).where(eq(products.id, r.id));
      }
    }
  }
  console.log(lines.join("\n"));
  console.log(`\n${changed} kleurvarianten krijgen een kostprijs (van bekende serie-inkoop/m²).`);
  console.log(APPLY ? "→ WEGGESCHREVEN." : "→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
