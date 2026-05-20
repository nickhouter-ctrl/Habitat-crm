/**
 * Herprijs de ETHICK-import (collecties "Bloempotten" + "Tuinmeubilair").
 *
 * Verkoopprijs = vaste marge ex-BTW op de inkoop, incl-BTW afgerond op .95;
 * aannemersprijs = 80% daarvan (mits resterende marge ≥ 20%).
 * Zelfde logica als import-ethick-pots.ts — pas MARGIN_PCT aan en draai opnieuw.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

/** Gewenste marge (ex-BTW) op de inkoopprijs. */
const MARGIN_PCT = 50;

function roundTo95(incl: number): number {
  const cents95 = Math.round((incl - 0.95) / 1);
  return Math.max(0.95, cents95 + 0.95);
}
function pricing(cost: number): { priceEx: number; tradeEx: number } {
  const targetIncl = (cost / (1 - MARGIN_PCT / 100)) * 1.21;
  const inclP = roundTo95(targetIncl);
  const priceEx = Math.round((inclP / 1.21) * 10000) / 10000;
  const tradeIncl = roundTo95(inclP * 0.8);
  const tradeExRaw = Math.round((tradeIncl / 1.21) * 10000) / 10000;
  const tradeEx = (tradeExRaw - cost) / tradeExRaw >= 0.2 ? tradeExRaw : priceEx;
  return { priceEx, tradeEx };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const rows = await sql<{ id: string; sku: string; cost_eur: string }[]>`
    SELECT id, sku, cost_eur FROM products
    WHERE collection IN ('Bloempotten', 'Tuinmeubilair') AND cost_eur IS NOT NULL
    ORDER BY sku
  `;
  let n = 0;
  for (const r of rows) {
    const cost = Number(r.cost_eur);
    const { priceEx, tradeEx } = pricing(cost);
    await sql`
      UPDATE products
      SET price_eur = ${priceEx.toFixed(4)},
          trade_price_eur = ${tradeEx.toFixed(4)},
          target_margin_pct = ${MARGIN_PCT},
          updated_at = NOW()
      WHERE id = ${r.id}
    `;
    n++;
  }
  console.log(`${n} producten herprijst op ${MARGIN_PCT}% marge.`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
