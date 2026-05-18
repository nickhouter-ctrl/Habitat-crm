/**
 * Vul tradePriceEur voor alle producten: 80% van de particulierprijs (incl.
 * BTW afgerond op .95), maar alleen wanneer er na 20% korting nog ≥20%
 * marge overblijft.
 *
 * Producten met te dunne marge (KKR-SG en eventueel toekomstige): laat
 * leeg → val terug op particulierprijs.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

/** Rondt een incl-BTW prijs af op de dichtstbijzijnde .95 boven of onder. */
function roundTo95(inclTarget: number): number {
  // (target − 0.95) → round naar geheel → + 0.95
  const cents95 = Math.round((inclTarget - 0.95) / 1);
  return Math.max(0.95, cents95 + 0.95);
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<Array<{
    id: string; sku: string | null; name: string;
    price_eur: string | null; cost_eur: string | null; vat_rate: number;
  }>>`
    SELECT id, sku, name, price_eur, cost_eur, vat_rate
    FROM products WHERE is_active = true AND price_eur IS NOT NULL
  `;

  let set = 0;
  let skipped = 0;
  const examples: Array<{ sku: string; price: number; trade: number; newMargin: number }> = [];

  for (const p of rows) {
    const price = Number(p.price_eur);
    const cost = p.cost_eur ? Number(p.cost_eur) : 0;
    const vatPct = p.vat_rate ?? 21;
    const inclPrice = price * (1 + vatPct / 100);

    // Doel: 20% lager incl-BTW, afgerond op .95
    const targetIncl = roundTo95(inclPrice * 0.80);
    const tradeEx = targetIncl / (1 + vatPct / 100);

    // Resterende marge moet ≥20% zijn anders niet zetten (bv. KKR-SG)
    const newMargin = cost > 0 && tradeEx > 0 ? (tradeEx - cost) / tradeEx : 1;
    if (cost > 0 && newMargin < 0.20) {
      skipped++;
      console.log(`  SKIP ${p.sku?.padEnd(12)} | marge bij 20% korting: ${(newMargin*100).toFixed(0)}% (te dun)`);
      continue;
    }

    await sql`UPDATE products SET trade_price_eur = ${tradeEx.toFixed(4)} WHERE id = ${p.id}`;
    set++;
    if (examples.length < 6) examples.push({ sku: p.sku ?? "?", price, trade: tradeEx, newMargin });
  }

  console.log(`\nTrade-prijs gezet voor ${set} producten · ${skipped} overgeslagen (te dun)`);
  console.log("\nVoorbeelden:");
  for (const e of examples) {
    console.log(`  ${e.sku.padEnd(12)} | particulier ex €${e.price.toFixed(2)} → trade ex €${e.trade.toFixed(2)} (marge ${(e.newMargin*100).toFixed(0)}%)`);
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
