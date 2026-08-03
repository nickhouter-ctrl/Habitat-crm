/**
 * Eén sleutel per leverancier, dwars door schrijfwijzen heen.
 *
 * Dezelfde partij komt in allerlei gedaanten binnen — bij Ahmed alleen al drie:
 *   "Ahmed Bouzekri" · "ahmed bouzekri" · "Ahmed Bouzekri (Construcciones Ahmed Javea)"
 * Zonder normalisatie staan zijn 17 facturen over drie regels verspreid en klopt
 * geen enkel totaal.
 *
 * Wat eraf gaat: hoofdletters, leestekens, accenten, een toevoeging tussen
 * haakjes en de rechtsvorm aan het eind (SL, S.L.U., SA, BV, Ltd). Wat NIET
 * gebeurt: raden. "Allpack (CN agent)" en "ALLPACK ENTERPRISES LTD" blijven
 * gescheiden — dat zijn in de administratie twee partijen, en ze samenvoegen op
 * een gok zou bedragen door elkaar husselen.
 */

/** SQL-expressie voor dezelfde sleutel; houd gelijk aan {@link supplierKey}. */
export const SUPPLIER_KEY_SQL = (kolom: string) => `
  regexp_replace(
    lower(
      regexp_replace(
        regexp_replace(${kolom}, '\\([^)]*\\)', '', 'g'),
        '[^0-9a-zA-Z]', '', 'g'
      )
    ),
    '(sociedadlimitada|slu|sl|sau|sa|sll|bv|ltd|limited|inc|gmbh)$', ''
  )`;

/** Naam → sleutel (JS-kant). */
export function supplierKey(naam: string | null | undefined): string {
  return (naam ?? "")
    .replace(/\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9a-zA-Z]/g, "")
    .toLowerCase()
    .replace(/(sociedadlimitada|slu|sl|sau|sa|sll|bv|ltd|limited|inc|gmbh)$/, "");
}
