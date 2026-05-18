/**
 * Eenmalige migratie: laatste Nederlandse fragmenten naar Engels.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const UPDATES: Array<{ sku: string; description: string }> = [
  { sku: "DR-010",     description: "SS304 brushed bronze door stopper." },
  { sku: "KKR-1261-1", description: "Design white · 702×452×80mm · solid surface · matt · 1 faucet hole · 1 drain" },
  { sku: "KKR-1264-1", description: "Design white · 1202×455×80mm · solid surface · matt · 2 faucet holes · 1 drain" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  let updated = 0;
  for (const u of UPDATES) {
    const r = await sql`
      UPDATE products SET description = ${u.description}, updated_at = NOW()
      WHERE sku = ${u.sku} RETURNING sku
    `;
    if (r.length === 0) console.warn(`! Niet gevonden: ${u.sku}`);
    else { console.log(`✓ ${u.sku}`); updated++; }
  }

  console.log(`\nTotaal updates: ${updated}/${UPDATES.length}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
