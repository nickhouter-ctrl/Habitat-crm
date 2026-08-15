/**
 * Eenmalig: campagnes én creatives leeghalen (verzoek 15-08).
 * Weg: ads, ad_sets, campaigns (Meta-ads), renders, creative_specs.
 * Blijft: assets (beeldbibliotheek), copy_blocks, email_campaigns.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  try {
    const counts = await sql`
      select
        (select count(*) from ads) as ads,
        (select count(*) from ad_sets) as ad_sets,
        (select count(*) from campaigns) as campaigns,
        (select count(*) from renders) as renders,
        (select count(*) from creative_specs) as creative_specs,
        (select count(*) from assets) as assets_blijven,
        (select count(*) from copy_blocks) as copy_blocks_blijven`;
    console.log("Voor:", counts[0]);

    await sql.begin(async (tx) => {
      await tx`delete from ads`;
      await tx`delete from ad_sets`;
      await tx`delete from campaigns`;
      await tx`delete from renders`;
      await tx`delete from creative_specs`;
    });

    const after = await sql`
      select
        (select count(*) from ads) as ads,
        (select count(*) from ad_sets) as ad_sets,
        (select count(*) from campaigns) as campaigns,
        (select count(*) from renders) as renders,
        (select count(*) from creative_specs) as creative_specs,
        (select count(*) from assets) as assets_blijven,
        (select count(*) from copy_blocks) as copy_blocks_blijven`;
    console.log("Na:", after[0]);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
