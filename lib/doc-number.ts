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
 *
 * LET OP: dit is alleen voor een *voorbeeld*-nummer in het formulier. Het echte,
 * gegarandeerd-unieke nummer wordt bij het opslaan toegekend door
 * `insertNumberedDocument` — twee tabbladen of een dubbelklik zouden hier anders
 * hetzelfde nummer kunnen lezen.
 */
export async function nextDocNumber(kind: DocKind, year = new Date().getFullYear()): Promise<string> {
  const prefix = `${DOC_KIND_PREFIX[kind]}-${year}-`;
  const next = (await maxSeqForPrefix(db, prefix)) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

/** Hoogste bestaande volgnummer met exact dit prefix (0 als er nog geen is). */
async function maxSeqForPrefix(
  conn: Pick<typeof db, "select">,
  prefix: string,
): Promise<number> {
  const [row] = await conn
    .select({
      maxSeq: sql<number>`coalesce(max((regexp_replace(${documents.docNumber}, '^.*-', ''))::int), 0)`,
    })
    .from(documents)
    .where(sql`${documents.docNumber} ~ ${`^${prefix}[0-9]+$`}`);
  return row?.maxSeq ?? 0;
}

/** Of een nummer al ons eigen automatische patroon volgt (PREFIX-JAAR-1234). */
function isAutoNumber(docNumber: string | null | undefined, prefix: string): boolean {
  return !docNumber || new RegExp(`^${prefix}[0-9]+$`).test(docNumber);
}

type DocumentInsert = typeof documents.$inferInsert;

/**
 * Voeg een document in met een gegarandeerd uniek, opvolgend nummer — race-vrij.
 *
 * Een transactie-brede advisory-lock (per soort + jaar) serialiseert het uitgeven
 * van het nummer én de insert, zodat twee gelijktijdige verzoeken (dubbelklik, twee
 * tabbladen) nooit hetzelfde nummer krijgen. De lock wordt bij commit losgelaten;
 * `pg_advisory_xact_lock` is transactie-gebonden en werkt dus ook via de Supabase
 * transaction-pooler.
 *
 * Geef in `values.docNumber` een *handmatig* nummer mee (afwijkend van ons
 * automatische patroon) om dat te behouden; een leeg of automatisch nummer wordt
 * altijd vers toegekend.
 */
export async function insertNumberedDocument(
  kind: DocKind,
  values: Omit<DocumentInsert, "docNumber"> & { docNumber?: string | null },
  year = new Date().getFullYear(),
): Promise<{ id: string; docNumber: string }> {
  const prefix = `${DOC_KIND_PREFIX[kind]}-${year}-`;
  const custom = isAutoNumber(values.docNumber, prefix) ? null : values.docNumber!.trim();

  return db.transaction(async (tx) => {
    // Serialiseer nummer-uitgifte per soort+jaar over alle connecties heen.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
    const docNumber = custom ?? `${prefix}${String((await maxSeqForPrefix(tx, prefix)) + 1).padStart(4, "0")}`;
    const [row] = await tx
      .insert(documents)
      .values({ ...values, docNumber })
      .returning({ id: documents.id });
    return { id: row.id, docNumber };
  });
}
