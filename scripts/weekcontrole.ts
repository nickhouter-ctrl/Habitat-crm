/**
 * Weekcontrole handmatig draaien; de logica staat in lib/weekcontrole.ts.
 *
 *   NODE_OPTIONS="--conditions=react-server" npx tsx scripts/weekcontrole.ts [uitvoer.html]
 */
import "./load-env";

import { writeFileSync } from "node:fs";

import { bouwArtifactHtml, tekstSamenvatting, verzamelWeekcontrole } from "../lib/weekcontrole";

(async () => {
  const uitvoerPad = process.argv[2];
  const data = await verzamelWeekcontrole();
  console.log(tekstSamenvatting(data));
  if (uitvoerPad) {
    writeFileSync(uitvoerPad, bouwArtifactHtml(data));
    console.log(`\nHTML geschreven naar ${uitvoerPad}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
