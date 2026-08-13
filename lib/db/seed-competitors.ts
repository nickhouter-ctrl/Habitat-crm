/**
 * Seed van de concurrenten-startlijst (U8) — door de Coordinator onderzochte
 * prospects rond Xàbia/Jávea. Zonder Meta Page-ID (null): het id wordt in de
 * UI opgezocht via "Zoek page-ID" (Ad Library-zoekactie).
 *
 *   npx tsx lib/db/seed-competitors.ts
 *
 * Idempotent: bestaande namen worden overgeslagen; handmatig toegevoegde of
 * al gekoppelde concurrenten blijven ongemoeid.
 */
import "../../scripts/load-env"; // eerst — laadt .env.local vóór lib/db

import { eq } from "drizzle-orm";

import { db, pgClient } from "./index";
import { competitors } from "./schema";

const START_LIST: Array<{
  name: string;
  segment: "materials" | "contractor";
  website?: string;
  notes?: string;
}> = [
  { name: "Azulejos Jávea", segment: "materials", website: "https://azulejosjavea.com" },
  { name: "Eurogres", segment: "materials", website: "https://azulejoseurogres.es" },
  { name: "MicroArt Jávea", segment: "materials", website: "https://microartjavea.com" },
  { name: "Hormimpres", segment: "materials", website: "https://hormimpres.com" },
  { name: "Posada Reformas", segment: "contractor", website: "https://posadareformas.com" },
  { name: "Benova Construction Jávea", segment: "contractor" },
  { name: "Coney Construction SL", segment: "contractor" },
  { name: "A&M Builders Jávea", segment: "contractor" },
  { name: "Juan Sala Construcciones", segment: "contractor", notes: "Moraira" },
  { name: "Kevin Jones Construction", segment: "contractor", notes: "Benitachell" },
];

async function main() {
  let inserted = 0;
  let skipped = 0;
  for (const prospect of START_LIST) {
    const [existing] = await db
      .select({ id: competitors.id })
      .from(competitors)
      .where(eq(competitors.name, prospect.name))
      .limit(1);
    if (existing) {
      skipped++;
      continue;
    }
    await db.insert(competitors).values({
      name: prospect.name,
      metaPageId: null,
      website: prospect.website ?? null,
      segment: prospect.segment,
      notes: prospect.notes ?? null,
    });
    inserted++;
  }
  console.log(
    `competitors: ${inserted} prospects toegevoegd, ${skipped} bestonden al (startlijst ${START_LIST.length}).`,
  );
  await pgClient.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
