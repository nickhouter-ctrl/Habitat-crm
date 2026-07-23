/**
 * Trek de adviesprijs (verkoopprijs) van te goedkoop-per-m² geprijsde maten op
 * naar de normale €/m² van het paneel (= de €/m² van de grootste maat / basis),
 * afgerond op € X,95 incl btw (stappen van € 5). Alleen maten die >2% onder de
 * referentie liggen worden verhoogd; niets wordt verlaagd. De prijzen staan in
 * de additionalSizes-jsonb per maatvariant. Afgesproken 21-07-2026.
 *
 *   npx tsx scripts/normalize-size-retail.ts            (dry-run)
 *   npx tsx scripts/normalize-size-retail.ts --apply
 */
import "./load-env";
import { and, eq, gt, isNotNull } from "drizzle-orm";

import { db } from "./../lib/db";
import { products } from "./../lib/db/schema";

const APPLY = process.argv.includes("--apply");
const VAT = 1.21;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const e = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const areaOf = (label: string) => {
  const m = String(label).match(/(\d{2,4})\D+(\d{2,4})/);
  return m ? (Number(m[1]) * Number(m[2])) / 1_000_000 : null;
};
// Dichtstbijzijnde € X,95 (veelvoud van 5 min € 0,05).
const nice5 = (x: number) => Math.round(x / 5) * 5 - 0.05;

type Addl = { sku?: string; label?: string; priceEur?: number; [k: string]: unknown };

async function main() {
  const rows = await db
    .select({ id: products.id, name: products.name, w: products.widthMm, h: products.heightMm, price: products.priceEur, addl: products.additionalSizes })
    .from(products)
    .where(and(eq(products.collection, "Wandpanelen"), eq(products.isActive, true), isNotNull(products.costEur), gt(products.costEur, "0")));

  let changedSizes = 0, changedPanels = 0;
  const lines: string[] = [];
  for (const r of rows) {
    const addl = Array.isArray(r.addl) ? (r.addl as Addl[]) : [];
    if (!addl.length) continue;
    // Referentie €/m² = de €/m² van de grootste maat (met eigen prijs).
    let refM2 = 0, refArea = 0;
    for (const a of addl) {
      const ar = areaOf(a.label ?? "");
      if (a.priceEur != null && ar && ar > refArea) { refArea = ar; refM2 = a.priceEur / ar; }
    }
    if (!refM2) continue;

    let panelChanged = false;
    const next = addl.map((a) => {
      const area = areaOf(a.label ?? "");
      if (a.priceEur == null || !area) return a;
      const curM2 = a.priceEur / area;
      if (curM2 >= refM2 * 0.90) return a; // minder dan 10% onder referentie → laten
      const newEx = r4(nice5(refM2 * area * VAT) / VAT);
      if (newEx <= a.priceEur) return a; // nooit verlagen
      changedSizes++;
      panelChanged = true;
      lines.push(
        `  ${r.name.slice(0, 32).padEnd(33)} ${String(a.label).padEnd(11)} ${e(a.priceEur)} (${e(a.priceEur * VAT)}, €${curM2.toFixed(0)}/m²) → ${e(newEx)} (${e(newEx * VAT)}, €${(newEx / area).toFixed(0)}/m²)`,
      );
      return { ...a, priceEur: newEx };
    });
    if (panelChanged) {
      changedPanels++;
      if (APPLY) await db.update(products).set({ additionalSizes: next, updatedAt: new Date() }).where(eq(products.id, r.id));
    }
  }
  console.log(lines.join("\n"));
  console.log(`\n${changedSizes} maten in ${changedPanels} panelen omhoog.`);
  console.log(APPLY ? "→ WEGGESCHREVEN naar het systeem." : "→ dry-run, niets gewijzigd (draai met --apply).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
