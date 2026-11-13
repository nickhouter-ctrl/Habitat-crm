/**
 * Importeert een lokale map met beelden (bv. de Drive-map "Flex-Surfaces -
 * Alle content", eerst gedownload) in de beeldbibliotheek van de
 * marketingmodule, via dezelfde pijplijn als uploads: sharp → pHash-duplicaat-
 * check → Supabase-opslag → `assets`-rij.
 *
 * - `sourceRef` = bestandsnaam: de social-planner leidt daar het thema uit af
 *   (bv. "MS-033-...-exterieur", "install-adhesive", "curved-shower").
 * - Tags: "flex-surfaces", "drive" plus de MS-code als die in de naam staat.
 * - Duplicaten (zelfde beeld als .jpg én .webp, of al eerder geïmporteerd)
 *   worden niet opnieuw opgeslagen; de pijplijn voegt alleen tags samen.
 *
 *   npx tsx scripts/import-drive-folder.ts <map>            (dry run)
 *   npx tsx scripts/import-drive-folder.ts <map> --apply    (schrijft naar productie-opslag + DB)
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";

import { ingestFromBytes } from "../app/api/assets/_ingest";

const APPLY = process.argv.includes("--apply");
const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir || !fs.existsSync(dir)) {
  console.error("Gebruik: npx tsx scripts/import-drive-folder.ts <map> [--apply]");
  process.exit(1);
}

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function tagsFor(name: string): string[] {
  const tags = ["flex-surfaces", "drive"];
  const ms = name.match(/ms-?(\d{3})/i);
  if (ms) tags.push(`MS-${ms[1]}`);
  return tags;
}

async function main() {
  const files = fs
    .readdirSync(dir!)
    .filter((f) => TYPES[path.extname(f).toLowerCase()])
    .sort();
  console.log(`${files.length} beelden in ${dir}${APPLY ? "" : " (dry run — niets wordt geschreven)"}`);
  if (!APPLY) {
    for (const f of files.slice(0, 10)) console.log("  ", f, tagsFor(f).join(","));
    console.log("Draai opnieuw met --apply om te importeren.");
    return;
  }
  let created = 0, dupes = 0, failed = 0;
  for (const [i, f] of files.entries()) {
    try {
      const bytes = new Uint8Array(fs.readFileSync(path.join(dir!, f)));
      const res = await ingestFromBytes({
        bytes,
        contentType: TYPES[path.extname(f).toLowerCase()],
        source: "upload",
        sourceRef: f,
        tags: tagsFor(f),
      });
      if (res.status === "duplicate") dupes++;
      else created++;
    } catch (e) {
      failed++;
      console.error("FOUT", f, e instanceof Error ? e.message : e);
    }
    if ((i + 1) % 50 === 0) console.log(`${i + 1}/${files.length} — nieuw ${created}, duplicaat ${dupes}, fout ${failed}`);
  }
  console.log(`Klaar: nieuw ${created}, duplicaat ${dupes}, fout ${failed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
