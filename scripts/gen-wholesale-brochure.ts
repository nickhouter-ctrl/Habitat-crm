/**
 * Genereer de Flexibel Stone groothandels-prijsbrochure voor de wandpanelen.
 *
 *   npx tsx scripts/gen-wholesale-brochure.ts "Age Stone"        (één serie — proef)
 *   npx tsx scripts/gen-wholesale-brochure.ts ALL                (hele collectie)
 *   npx tsx scripts/gen-wholesale-brochure.ts ALL de             (in het Duits)
 *   npx tsx scripts/gen-wholesale-brochure.ts ALL all-langs      (nl+de+en+es)
 *
 * Prijsregels staan in lib/wholesale-brochure-data.ts (gedeeld met de CRM-route).
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildWholesaleItems } from "./../lib/wholesale-brochure-data";
import { renderWholesaleBrochure, type BrochureLocale } from "./../lib/wholesale-brochure-pdf";

const LOCALES: BrochureLocale[] = ["nl", "de", "en", "es"];

async function main() {
  const arg = process.argv[2] ?? "Age Stone";
  const langArg = (process.argv[3] ?? "nl").toLowerCase();
  const langs: BrochureLocale[] =
    langArg === "all-langs" ? LOCALES : LOCALES.includes(langArg as BrochureLocale) ? [langArg as BrochureLocale] : ["nl"];

  const { items, meta, total, zonderInkoop } = await buildWholesaleItems(arg);
  if (total === 0) {
    console.error(`Geen actieve wandpanelen gevonden voor "${arg}".`);
    process.exit(1);
  }

  const safe = arg.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  for (const locale of langs) {
    const pdf = await renderWholesaleBrochure({ items, meta, locale });
    const out = path.join(os.homedir(), "Downloads", `Flexibel-Stone-groothandel-${safe}-${locale}.pdf`);
    writeFileSync(out, pdf);
    console.log(`Brochure (${locale}): ${out}`);
  }
  console.log(
    `  ${items.length} panelen` +
      (zonderInkoop ? `, waarvan ${zonderInkoop} zonder inkoopprijs → "op aanvraag"` : ""),
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
