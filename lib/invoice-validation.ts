/**
 * Controleert of de klantgegevens compleet genoeg zijn om een factuur te mogen
 * versturen (Spanje). Verplicht: naam, een fiscaal nummer, en een volledig adres.
 * Deze velden mogen op het contact of op het gekoppelde bedrijf staan
 * (bedrijfsklant heeft het btw-nummer op de company). Welk fiscaal nummer we
 * vragen hangt af van het klanttype: bedrijf → NIF/CIF of btw-nummer,
 * particulier (geen gekoppeld bedrijf) → NIE of BSN.
 *
 * Twee niveaus sinds 17 november 2026. Postcode en plaats hielden het versturen
 * tegen, maar tegen de tijd dat er een factuur ligt is de klant allang bekend en
 * moet die factuur gewoon de deur uit. Ze worden nog wél gemeld — op de factuur
 * zelf en in het data-check-rapport — want een Spaanse factura hoort het
 * volledige adres van de ontvanger te dragen. Wat de klant identificeert (naam,
 * fiscaal nummer, adres, land) blokkeert nog steeds: zonder die vier is het geen
 * factuur maar een prijsopgave.
 */
export type BillingContact = {
  name?: string | null;
  taxId?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
} | null | undefined;

export type BillingCompany = {
  name?: string | null;
  vatNumber?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
} | null | undefined;

type BillingField = "naam" | "fiscaalNummer" | "adres" | "postcode" | "plaats" | "land";

/** Velden die het versturen daadwerkelijk tegenhouden. */
const BLOCKING: ReadonlySet<BillingField> = new Set<BillingField>([
  "naam",
  "fiscaalNummer",
  "adres",
  "land",
]);

const v = (s: string | null | undefined) => (s ?? "").trim();

function evaluate(
  contact: BillingContact,
  company: BillingCompany,
): { field: BillingField; label: string }[] {
  const name = v(contact?.name) || v(company?.name);
  const taxId = v(contact?.taxId) || v(company?.vatNumber);
  const addressLine = v(contact?.addressLine) || v(company?.addressLine);
  const postalCode = v(contact?.postalCode) || v(company?.postalCode);
  const city = v(contact?.city) || v(company?.city);
  const country = v(contact?.country) || v(company?.country);

  // Particulier = geen gekoppeld bedrijf: die heeft geen NIF/CIF of btw-nummer,
  // maar identificeert zich met een NIE (of Nederlands BSN).
  const isParticulier = !company;

  const missing: { field: BillingField; label: string }[] = [];
  if (!name) missing.push({ field: "naam", label: "naam" });
  if (!taxId) {
    missing.push({
      field: "fiscaalNummer",
      label: isParticulier ? "NIE of BSN" : "NIF/CIF of btw-nummer",
    });
  }
  if (!addressLine) missing.push({ field: "adres", label: "adres (straat + huisnummer)" });
  if (!postalCode) missing.push({ field: "postcode", label: "postcode" });
  if (!city) missing.push({ field: "plaats", label: "plaats" });
  if (!country) missing.push({ field: "land", label: "land" });
  return missing;
}

/** Alle ontbrekende facturatie-velden (leeg = compleet). Voor melding en rapportage. */
export function missingBillingFields(contact: BillingContact, company: BillingCompany): string[] {
  return evaluate(contact, company).map((m) => m.label);
}

/** Alleen de ontbrekende velden die het versturen tegenhouden (leeg = mag weg). */
export function blockingBillingFields(contact: BillingContact, company: BillingCompany): string[] {
  return evaluate(contact, company)
    .filter((m) => BLOCKING.has(m.field))
    .map((m) => m.label);
}

export const isBillingComplete = (contact: BillingContact, company: BillingCompany) =>
  missingBillingFields(contact, company).length === 0;
