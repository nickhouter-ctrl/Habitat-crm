/**
 * Kolomkoppen van een gekochte of gescrapete lijst herkennen.
 *
 * De lijsten komen uit allerlei bronnen en zijn Spaans, Nederlands of Engels.
 * "Empresa", "Bedrijfsnaam" en "Company name" zijn hetzelfde veld; "Correo
 * electrónico" en "E-mail" ook. Daarom een synoniementabel in plaats van een
 * vaste kolomvolgorde: je kunt een bestand uploaden zoals je het gekregen hebt.
 *
 * Wat het NIET doet: raden. Een kop die er niet in staat wordt `null`, en dan
 * kiest de gebruiker zelf wat het is. Dat is beter dan een verkeerd geraden
 * kolom die stilzwijgend in het verkeerde veld belandt.
 */

export type ProspectField =
  | "companyName"
  | "email"
  | "website"
  | "phone"
  | "addressLine"
  | "postalCode"
  | "city"
  | "province"
  | "country"
  | "sector"
  | "contactPersonName"
  | "notes"
  /** Kolom overslaan. */
  | "ignore"
  /** Kolom bewaren als label bij de prospect (bv. "10-50 medewerkers"). */
  | "tag";

/** Het enige veld dat er echt moet zijn: zonder naam is een rij niets. */
export const VERPLICHT: ProspectField[] = ["companyName"];

export const PROSPECT_FIELD_LABEL: Record<ProspectField, string> = {
  companyName: "Bedrijfsnaam",
  email: "E-mailadres",
  website: "Website",
  phone: "Telefoon",
  addressLine: "Adres",
  postalCode: "Postcode",
  city: "Plaats",
  province: "Provincie",
  country: "Land",
  sector: "Branche",
  contactPersonName: "Contactpersoon",
  notes: "Opmerking",
  ignore: "— niet importeren —",
  tag: "Bewaren als label",
};

type Herkenbaar = Exclude<ProspectField, "ignore" | "tag">;

export const PROSPECT_SYNONYMS: Record<Herkenbaar, string[]> = {
  companyName: [
    "bedrijf", "bedrijfsnaam", "naam", "firma", "onderneming",
    "empresa", "nombre", "nombre empresa", "nombre de empresa", "razon social", "razon social empresa", "denominacion",
    "company", "company name", "business", "business name", "name", "organisation", "organization",
  ],
  email: [
    "e-mail", "email", "emailadres", "e-mailadres", "mail", "mailadres",
    "correo", "correo electronico", "correo e", "e correo", "direccion de correo",
    "email address", "e-mail address", "mail 1", "email1", "email 1",
  ],
  website: ["website", "web", "url", "site", "webadres", "pagina web", "pagina", "dominio", "domain", "homepage"],
  phone: [
    "telefoon", "telefoonnummer", "tel", "tel.", "mobiel", "gsm",
    "telefono", "telefono 1", "movil", "moviles", "tlf", "tfno",
    "phone", "phone number", "mobile", "telephone",
  ],
  addressLine: ["adres", "straat", "straatnaam", "direccion", "domicilio", "calle", "via", "address", "street", "street address"],
  postalCode: ["postcode", "pc", "codigo postal", "cod postal", "cp", "zip", "zipcode", "zip code", "postal code"],
  city: ["plaats", "stad", "woonplaats", "gemeente", "ciudad", "poblacion", "localidad", "municipio", "city", "town"],
  province: ["provincie", "regio", "provincia", "region", "comunidad", "comunidad autonoma", "state", "province", "county"],
  country: ["land", "pais", "country", "nacion"],
  sector: [
    "branche", "sector", "activiteit", "bedrijfstak", "soort",
    "actividad", "cnae", "epigrafe", "categoria", "tipo", "tipo de empresa", "rubro",
    "industry", "industria", "category", "type", "trade",
  ],
  contactPersonName: [
    "contactpersoon", "persoon", "voornaam", "achternaam",
    "contacto", "persona de contacto", "persona", "responsable", "gerente",
    "contact", "contact person", "contact name", "first name", "last name",
  ],
  notes: ["opmerking", "opmerkingen", "notitie", "notities", "observaciones", "notas", "comentarios", "notes", "remarks", "comment"],
};

/**
 * Kop op één vorm brengen: kleine letters, accenten eraf, leestekens eraf,
 * één spatie. Zo vallen "Correo electrónico", "correo electronico" en
 * "CORREO ELECTRÓNICO:" samen.
 */
export function normalizeHeader(kop: string): string {
  return (kop ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^0-9a-zA-Z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const INDEX: Map<string, Herkenbaar> = new Map();
for (const [veld, namen] of Object.entries(PROSPECT_SYNONYMS) as [Herkenbaar, string[]][]) {
  for (const naam of namen) INDEX.set(normalizeHeader(naam), veld);
}

/** Kop → veld, of null als we het niet zeker weten. */
export function fieldForHeader(kop: string): Herkenbaar | null {
  const k = normalizeHeader(kop);
  if (!k) return null;
  return INDEX.get(k) ?? null;
}

export interface MappingVoorstel {
  /** Per kolomindex het voorgestelde veld (null = onbekend, kies zelf). */
  mapping: (ProspectField | null)[];
  /** Koppen die we niet herkenden, met hun kolomindex. */
  onbekend: { index: number; kop: string }[];
  /** Verplichte velden die nog nergens aan gekoppeld zijn. */
  ontbreekt: ProspectField[];
}

/**
 * Hele kopregel → voorstel. Komt een veld twee keer voor (twee e-mailkolommen),
 * dan wint de eerste en wordt de tweede onbekend: welke van de twee de goede is,
 * kan alleen de gebruiker zeggen.
 */
export function suggestMapping(koppen: string[]): MappingVoorstel {
  const mapping: (ProspectField | null)[] = [];
  const gebruikt = new Set<ProspectField>();
  const onbekend: { index: number; kop: string }[] = [];

  koppen.forEach((kop, i) => {
    const veld = fieldForHeader(kop);
    if (veld && !gebruikt.has(veld)) {
      gebruikt.add(veld);
      mapping[i] = veld;
    } else {
      mapping[i] = null;
      if ((kop ?? "").trim()) onbekend.push({ index: i, kop });
    }
  });

  return { mapping, onbekend, ontbreekt: VERPLICHT.filter((v) => !gebruikt.has(v)) };
}

/** Eén rij + mapping → velden. Labels komen samen in `tags`. */
export type ProspectRowIn = Partial<Record<Exclude<ProspectField, "ignore" | "tag">, string>> & { tags?: string[] };

export function rowToProspect(rij: string[], mapping: (ProspectField | null)[], koppen: string[]): ProspectRowIn {
  const uit: ProspectRowIn = {};
  const tags: string[] = [];
  mapping.forEach((veld, i) => {
    const waarde = (rij[i] ?? "").trim();
    if (!veld || veld === "ignore" || !waarde) return;
    if (veld === "tag") {
      const kop = (koppen[i] ?? "").trim();
      tags.push(kop ? `${kop}: ${waarde}` : waarde);
      return;
    }
    uit[veld] = waarde;
  });
  if (tags.length) uit.tags = tags;
  return uit;
}
