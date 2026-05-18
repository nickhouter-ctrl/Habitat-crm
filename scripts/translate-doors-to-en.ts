/**
 * Eenmalige migratie: Nederlandse deur-productnamen → Engels.
 * CRM-conventie is Engelse productnamen (matcht GS1 idioma1=Inglés).
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

// Lees .env.local handmatig (geen dotenv-dependency nodig)
for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const TRANSLATIONS: Record<string, { name: string; description?: string }> = {
  "DR-001": { name: "Hinges — brushed bronze (interior door)" },
  "DR-002": { name: "Interior Door — Basic" },
  "DR-002-SET": { name: "Interior Door Set 720×2600 Basic (bronze)" },
  "DR-003": { name: "Interior Door — Hotel Suite (fire-rated EI30)" },
  "DR-003-SET": { name: "Interior Door Set 920×2600 Hotel Suite EI30 (bronze)" },
  "DR-004": { name: "Exterior Door" },
  "DR-004-SET": { name: "Exterior Door Set 920×2400 (matte black)" },
  "DR-005": { name: "Exterior Door 2" },
  "DR-005-SET": { name: "Exterior Door Set 1220×2400 (matte black)" },
  "DR-006": { name: "Hinges — silver (fire-rated door)" },
  "DR-007": { name: "Door Closer (concealed)" },
  "DR-009": { name: "Magnetic Lock — bronze" },
  "DR-010": { name: "Door Stopper — bronze" },
  "DR-011": { name: "Hinges — matte black (exterior door)" },
  "DR-012": { name: "Threshold Seal — exterior door" },
};

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  let updated = 0;
  for (const [sku, t] of Object.entries(TRANSLATIONS)) {
    const r = await sql`
      UPDATE products
      SET name = ${t.name}, updated_at = NOW()
      WHERE sku = ${sku}
      RETURNING sku, name
    `;
    if (r.length === 0) {
      console.warn(`! Niet gevonden: ${sku}`);
    } else {
      console.log(`✓ ${r[0].sku.padEnd(15)} → ${r[0].name}`);
      updated++;
    }
  }

  console.log(`\nTotaal bijgewerkt: ${updated}/${Object.keys(TRANSLATIONS).length}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
