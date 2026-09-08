/**
 * Producten van een merk inladen uit een CSV.
 *
 * Draait standaard als DROOGLOOP: hij laat zien wat er zou gebeuren en schrijft
 * niets weg. Pas met `--toepassen` gaat het echt de database in.
 *
 *   npx tsx --env-file=.env.local scripts/import-producten.ts brauer ~/Downloads/brauer-kranen.csv
 *   npx tsx --env-file=.env.local scripts/import-producten.ts brauer ~/Downloads/brauer-kranen.csv --toepassen
 */
import { readFileSync } from "node:fs";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { brands, productVariants } from "@/lib/db/schema";
import { applyImport } from "@/lib/import/apply-import";
import { parseCsv } from "@/lib/import/parse-sheet";
import { planImport, type BestaandeVariant } from "@/lib/import/product-import";

function getal(n: number): string {
  return n.toLocaleString("nl-NL");
}

async function main() {
  const [slug, pad, ...vlaggen] = process.argv.slice(2);
  const toepassen = vlaggen.includes("--toepassen");
  if (!slug || !pad) {
    console.error("gebruik: import-producten.ts <merk-slug> <bestand.csv> [--toepassen]");
    process.exit(1);
  }

  const merk = await db.query.brands.findFirst({ where: eq(brands.slug, slug) });
  if (!merk) throw new Error(`merk "${slug}" bestaat niet — maak het eerst aan op /merken`);

  const { rows, onbekendeKolommen, overgeslagen } = parseCsv(readFileSync(pad, "utf8"));
  console.log(`\n${pad}`);
  console.log(`${getal(rows.length)} regels gelezen${overgeslagen ? `, ${overgeslagen} overgeslagen (geen code of naam)` : ""}`);
  console.log(`keuze-kolommen: ${onbekendeKolommen.join(", ") || "geen"}`);

  const codes = rows.map((r) => r.code);
  const bestaandeRijen = codes.length
    ? await db
        .select({
          code: productVariants.code,
          productId: productVariants.productId,
          priceEur: productVariants.priceEur,
          purchaseCostEur: productVariants.purchaseCostEur,
          label: productVariants.label,
          imageUrl: productVariants.imageUrl,
        })
        .from(productVariants)
        .where(inArray(productVariants.code, codes))
    : [];
  const bestaand = new Map<string, BestaandeVariant>(
    bestaandeRijen.map((r) => [
      r.code,
      {
        code: r.code,
        productId: r.productId,
        priceEur: r.priceEur == null ? null : Number(r.priceEur),
        purchaseCostEur: r.purchaseCostEur == null ? null : Number(r.purchaseCostEur),
        label: r.label,
        imageUrl: r.imageUrl,
      },
    ]),
  );

  const plan = planImport(rows, bestaand, {
    skuPrefix: merk.skuPrefix ?? "X",
    dealerDiscountPct: merk.dealerDiscountPct == null ? null : Number(merk.dealerDiscountPct),
  });

  console.log(`\n── droogloop ──────────────────────────────`);
  console.log(`producten          ${getal(plan.producten.length)}`);
  console.log(`uitvoeringen       ${getal(plan.nieuweUitvoeringen)} nieuw · ${getal(plan.bijgewerkteUitvoeringen)} bijgewerkt · ${getal(plan.ongewijzigdeUitvoeringen)} ongewijzigd`);
  console.log(`conflicten         ${getal(plan.conflicten.length)}`);

  if (plan.conflicten.length) {
    console.log("\nconflicten (worden NIET ingeladen):");
    for (const c of plan.conflicten.slice(0, 15)) console.log(`  ${c.code}: ${c.reden}`);
    if (plan.conflicten.length > 15) console.log(`  … en nog ${plan.conflicten.length - 15}`);
  }
  if (plan.waarschuwingen.length) {
    console.log("\nwaarschuwingen:");
    for (const w of plan.waarschuwingen.slice(0, 10)) console.log(`  ${w}`);
    if (plan.waarschuwingen.length > 10) console.log(`  … en nog ${plan.waarschuwingen.length - 10}`);
  }
  if (plan.wijzigingen.length) {
    console.log("\nwijzigingen aan bestaande uitvoeringen:");
    for (const w of plan.wijzigingen.slice(0, 15)) {
      console.log(`  ${w.code}  ${w.veld}: ${w.oud} → ${w.nieuw}`);
    }
    if (plan.wijzigingen.length > 15) console.log(`  … en nog ${plan.wijzigingen.length - 15}`);
  }

  console.log("\nproducten met hun keuzes:");
  for (const p of plan.producten.slice(0, 12)) {
    const assen = p.optionAxes.map((a) => `${a.label} (${a.values.length})`).join(" · ") || "geen keuzes";
    console.log(`  ${String(p.varianten.length).padStart(4)}×  ${p.name.slice(0, 52).padEnd(54)} ${assen}`);
  }
  if (plan.producten.length > 12) console.log(`  … en nog ${plan.producten.length - 12} producten`);

  if (!toepassen) {
    console.log("\nDroogloop — er is niets weggeschreven. Voeg --toepassen toe om het echt in te laden.\n");
    process.exit(0);
  }

  console.log("\n── inladen ────────────────────────────────");
  const res = await applyImport(plan, { id: merk.id, skuPrefix: merk.skuPrefix });
  console.log(`producten     ${getal(res.nieuweProducten)} nieuw · ${getal(res.bijgewerkteProducten)} bijgewerkt`);
  console.log(`uitvoeringen  ${getal(res.nieuweUitvoeringen)} nieuw · ${getal(res.bijgewerkteUitvoeringen)} bijgewerkt\n`);
  process.exit(0);
}

main();
