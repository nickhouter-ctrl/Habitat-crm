import { sql } from "drizzle-orm";

/**
 * Woord-voor-woord naamvergelijking in SQL — houd gelijk aan `naamHoortBij` in
 * `lib/purchase-orders.ts`. Elk woord van de ploegnaam (≥ 3 letters) moet in de
 * andere naam voorkomen.
 *
 * Niet op een aaneengeplakte sleutel vergelijken zoals bij leveranciers: een
 * factuur draagt vaak een naam méér dan de ploegkaart ("Wilhelmus Mark Strijks"
 * naast "Wilhelmus Strijks"), en dan bevat de een de ander niet.
 */
const WOORDEN = (kolom: string) =>
  sql.raw(`regexp_split_to_array(trim(regexp_replace(lower(${kolom}), '[^a-z]+', ' ', 'g')), ' ')`);

export const NAAM_HOORT_BIJ = (ploegKolom: string, andereKolom: string) => sql`(
  ${sql.raw(andereKolom)} is not null
  and exists (select 1 from unnest(${WOORDEN(ploegKolom)}) t where length(t) >= 3)
  and not exists (
    select 1 from unnest(${WOORDEN(ploegKolom)}) t
    where length(t) >= 3 and not (t = any(${WOORDEN(andereKolom)}))
  )
)`;

