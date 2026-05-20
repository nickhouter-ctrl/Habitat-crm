/**
 * Herprijs Magic Stone-wandpanelen: target ~75% marge per (categorie × format).
 * Alle items in dezelfde categorie + dezelfde plaat-afmeting krijgen dezelfde
 * prijs, ex-BTW prijs zo gekozen dat incl-BTW eindigt op .95.
 *
 * Logica:
 *   target_ex = avg_cost / 0.25      → 75% marge op gemiddelde cost
 *   target_incl = target_ex × 1.21
 *   afgerond op naast .95 → terugconverteren naar ex
 *
 * Trade-prijs (aannemer) wordt ook opnieuw gevuld: 80% van particulierprijs
 * incl-BTW afgerond op .95 (alleen als resterende marge ≥20%).
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

function roundTo95(inclTarget: number): number {
  const cents95 = Math.round((inclTarget - 0.95) / 1);
  return Math.max(0.95, cents95 + 0.95);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<Array<{
    id: string; sku: string; category: string;
    width_mm: string; height_mm: string;
    cost_eur: string; price_eur: string;
  }>>`
    SELECT id, sku, category, width_mm, height_mm, cost_eur, price_eur
    FROM products
    WHERE collection='Wandpanelen' AND sku LIKE 'MS-%'
      AND is_active=true AND cost_eur IS NOT NULL AND width_mm IS NOT NULL
    ORDER BY category, width_mm, height_mm, sku
  `;

  // Group op m²-band — vergelijkbare platen (1190x2400 ≈ 1200x2400) krijgen
  // dezelfde prijs. Volume-discount: hoe groter, hoe lager €/m².
  const BANDS: Array<{ label: string; min: number; max: number; pricePerM2Incl: number }> = [
    { label: "S klein (0.4-0.6 m²)",  min: 0.4, max: 0.6, pricePerM2Incl: 75 },
    { label: "M klein (0.6-0.85 m²)", min: 0.6, max: 0.85, pricePerM2Incl: 70 },
    { label: "M (1.3-1.5 m²)",        min: 1.3, max: 1.5, pricePerM2Incl: 68 },
    { label: "L (1.55-1.85 m²)",      min: 1.55, max: 1.85, pricePerM2Incl: 65 },
    { label: "XL (2.7-3.0 m²)",       min: 2.7, max: 3.0, pricePerM2Incl: 60 },
    { label: "XXL (3.2-3.4 m²)",      min: 3.2, max: 3.4, pricePerM2Incl: 58 },
    { label: "XXXL (3.4-3.7 m²)",     min: 3.4, max: 3.7, pricePerM2Incl: 55 },
  ];

  function bandFor(m2: number): typeof BANDS[number] | null {
    return BANDS.find((b) => m2 >= b.min && m2 < b.max) ?? null;
  }

  const groups = new Map<string, { band: typeof BANDS[number]; items: typeof rows }>();
  for (const r of rows) {
    const m2 = (Number(r.width_mm) * Number(r.height_mm)) / 1_000_000;
    const band = bandFor(m2);
    if (!band) {
      console.warn(`! Geen band voor ${r.sku} (${m2.toFixed(2)} m²)`);
      continue;
    }
    if (!groups.has(band.label)) groups.set(band.label, { band, items: [] as any });
    groups.get(band.label)!.items.push(r);
  }

  console.log(`Magic Stone bands: ${groups.size}\n`);
  console.log("Band                          | n  | gem.m² | gem.cost | €/m² incl | nieuwe incl | marge-range");
  console.log("─".repeat(110));

  let totalUpdated = 0;
  for (const [, { band, items }] of groups) {
    const avgM2 = items.reduce((s, r) => s + (Number(r.width_mm) * Number(r.height_mm)) / 1_000_000, 0) / items.length;
    const avgCost = items.reduce((s, r) => s + Number(r.cost_eur), 0) / items.length;

    // Binnen de band: € per m² is vast, prijs per item schaalt met werkelijke m².
    // Vergelijkbare maten krijgen vergelijkbare prijs, met klein verschil.
    console.log(
      band.label.padEnd(30),
      "|",
      items.length.toString().padStart(2),
      "|",
      avgM2.toFixed(2).padStart(5),
      "| €",
      avgCost.toFixed(2).padStart(7),
      "| €",
      band.pricePerM2Incl.toFixed(0).padStart(3),
      "/m² incl",
    );

    // Group binnen band op exact format zodat alle items met dezelfde
    // afmeting echt dezelfde prijs krijgen
    const byFormat = new Map<string, typeof items>();
    for (const r of items) {
      const k = `${r.width_mm}x${r.height_mm}`;
      if (!byFormat.has(k)) byFormat.set(k, [] as any);
      byFormat.get(k)!.push(r);
    }

    for (const [fmt, fItems] of byFormat) {
      const r0 = fItems[0];
      const m2 = (Number(r0.width_mm) * Number(r0.height_mm)) / 1_000_000;
      const targetIncl = band.pricePerM2Incl * m2;
      const newIncl = roundTo95(targetIncl);
      const newEx = Math.round((newIncl / 1.21) * 10000) / 10000;
      const tradeIncl = roundTo95(newIncl * 0.8);
      const tradeEx = Math.round((tradeIncl / 1.21) * 10000) / 10000;

      const margins = fItems.map((r) => ((newEx - Number(r.cost_eur)) / newEx) * 100);
      const minM = Math.min(...margins);
      const maxM = Math.max(...margins);

      console.log(
        `   ${fmt.padEnd(16)} ${m2.toFixed(2)} m² ×${fItems.length} → € ${newIncl.toFixed(2)} incl   (marge ${minM.toFixed(0)}-${maxM.toFixed(0)}%)`,
      );

      for (const r of fItems) {
        const cost = Number(r.cost_eur);
        const newTradeEx = (cost > 0 && (tradeEx - cost) / tradeEx >= 0.20) ? tradeEx : newEx;
        await sql`
          UPDATE products
          SET price_eur = ${newEx.toFixed(4)},
              trade_price_eur = ${newTradeEx.toFixed(4)},
              updated_at = NOW()
          WHERE id = ${r.id}
        `;
        totalUpdated++;
      }
    }
  }

  console.log(`\n${totalUpdated} producten herprijst (1 prijs per m²-band, volume-discount voor grotere platen).`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
