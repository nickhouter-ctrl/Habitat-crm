/**
 * Bepaalt de weergavenaam (`contacts.name`) van een contact. Deze kolom is
 * gedenormaliseerd — elk scherm leest 'm direct — dus de volgorde-logica hoort
 * op één plek thuis en wordt aangeroepen op elk schrijfpad.
 *
 * Regel: bij een ZAKELIJK contact tonen we de BEDRIJFSNAAM eerst (i.p.v. de
 * voornaam). De contactpersoon blijft in first/lastName staan en wordt elders
 * getoond. Bij particulier: gewoon de persoonsnaam.
 */
export function contactDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  email?: string | null;
  isZakelijk?: boolean;
}): string {
  const personName = [input.firstName, input.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  const company = input.companyName?.trim();
  const email = input.email?.trim();

  if (input.isZakelijk && company) return company;
  return personName || company || email || "(naamloos)";
}
