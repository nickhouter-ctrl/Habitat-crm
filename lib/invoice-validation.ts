/**
 * Controleert of de klantgegevens compleet genoeg zijn om een factuur te mogen
 * versturen (Spanje). Verplicht: naam, een fiscaal nummer, en een volledig adres.
 * Deze velden mogen op het contact of op het gekoppelde bedrijf staan
 * (bedrijfsklant heeft het btw-nummer op de company). Welk fiscaal nummer we
 * vragen hangt af van het klanttype: bedrijf → NIF/CIF of btw-nummer,
 * particulier (geen gekoppeld bedrijf) → NIE of BSN.
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

const v = (s: string | null | undefined) => (s ?? "").trim();

/** Geeft de labels van ontbrekende verplichte facturatie-velden terug (leeg = compleet). */
export function missingBillingFields(contact: BillingContact, company: BillingCompany): string[] {
  const name = v(contact?.name) || v(company?.name);
  const taxId = v(contact?.taxId) || v(company?.vatNumber);
  const addressLine = v(contact?.addressLine) || v(company?.addressLine);
  const postalCode = v(contact?.postalCode) || v(company?.postalCode);
  const city = v(contact?.city) || v(company?.city);
  const country = v(contact?.country) || v(company?.country);

  const missing: string[] = [];
  // Particulier = geen gekoppeld bedrijf: die heeft geen NIF/CIF of btw-nummer,
  // maar identificeert zich met een NIE (of Nederlands BSN).
  const isParticulier = !company;

  if (!name) missing.push("naam");
  if (!taxId) missing.push(isParticulier ? "NIE of BSN" : "NIF/CIF of btw-nummer");
  if (!addressLine) missing.push("adres (straat + huisnummer)");
  if (!postalCode) missing.push("postcode");
  if (!city) missing.push("plaats");
  if (!country) missing.push("land");
  return missing;
}

export const isBillingComplete = (contact: BillingContact, company: BillingCompany) =>
  missingBillingFields(contact, company).length === 0;
