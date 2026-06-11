/** Server-side opvolgend documentnummer (gapless, per soort + jaar). */
import "server-only";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { DOC_KIND_PREFIX, type DocKind } from "@/lib/documents";

/**
 * Volgende documentnummer voor `kind`, bv. "FAC-2026-0011".
 *
 * Neemt het HOOGSTE bestaande volgnummer met exact dit prefix (bv. FAC-2026-)
 * en telt er 1 bij op. Tellen-op-aantal werkte niet: dat telde ook vreemd
 * genummerde documenten mee (bv. uit Holded geïmporteerde facturen `F2600xx`),
 * waardoor de teller ver vooruit sprong en er gaten ontstonden.
 */
export async function nextDocNumber(kind: DocKind, year = new Date().getFullYear()): Promise<string> {
  const prefix = `${DOC_KIND_PREFIX[kind]}-${year}-`;
  const [row] = await db
    .select({
      maxSeq: sql<number>`coalesce(max((regexp_replace(${documents.docNumber}, '^.*-', ''))::int), 0)`,
    })
    .from(documents)
    .where(sql`${documents.docNumber} ~ ${`^${prefix}[0-9]+$`}`);
  const next = (row?.maxSeq ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}
