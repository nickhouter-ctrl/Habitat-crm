/**
 * Wat gaat deze import precies doen? Eén pure functie, zodat het scherm dat
 * vóór het bevestigen toont en de import zelf gegarandeerd hetzelfde zijn.
 *
 * Bij 7.000 rijen uit een gekochte lijst is dat geen luxe. Zulke lijsten staan
 * vol dubbelen, dode adressen en bedrijven die al klant zijn. Dat wil je zien
 * vóórdat het in de database staat, niet erna.
 *
 * Vier lagen dedupe, alle vier exact — geen fuzzy matching:
 *   1. binnen het bestand zelf (zelfde adres, of zelfde bedrijf zonder adres)
 *   2. tegen `prospects` (staat al in de lijst)
 *   3. tegen `contacts` (is al klant of lead — niet koud aanschrijven)
 *   4. tegen `email_suppressions` (heeft zich afgemeld — nooit meer mailen)
 */
import { isRoleAddress, normalizeEmail, prospectCompanyKey } from "@/lib/leads/normalize";
import type { ProspectRowIn } from "@/lib/leads/prospect-columns";

export type OverslagReden =
  | "zonder-naam"
  | "dubbel-in-bestand"
  | "al-prospect"
  | "al-contact"
  | "afgemeld"
  | "ongeldig-adres"
  | "rol-adres";

export const REDEN_TEKST: Record<OverslagReden, string> = {
  "zonder-naam": "geen bedrijfsnaam",
  "dubbel-in-bestand": "staat twee keer in dit bestand",
  "al-prospect": "staat al in de lijst",
  "al-contact": "is al contact of klant",
  afgemeld: "heeft zich afgemeld",
  "ongeldig-adres": "geen geldig e-mailadres",
  "rol-adres": "adres zonder mens erachter (noreply@ e.d.)",
};

/** Eén rij zoals hij de database in gaat, met genormaliseerd adres. */
export interface NieuweProspect extends ProspectRowIn {
  email?: string;
  /** Rijnummer in het bestand (1-gebaseerd, kopregel niet meegerekend). */
  rij: number;
}

export interface BekendeGegevens {
  prospectEmails: Set<string>;
  contactEmails: Set<string>;
  suppressed: Set<string>;
  /** `prospectCompanyKey()` van bedrijven die al in de lijst staan. */
  prospectCompanyKeys: Set<string>;
}

export interface ImportPlan {
  nieuw: NieuweProspect[];
  /** Per reden hoeveel rijen, en de eerste tien als voorbeeld. */
  overgeslagen: Record<OverslagReden, number>;
  voorbeelden: { rij: number; reden: OverslagReden; waarde: string }[];
  /** Nieuwe rijen zonder e-mailadres: wel importeren, niet mailbaar. */
  zonderEmail: number;
  totaal: number;
}

const LEEG: Record<OverslagReden, number> = {
  "zonder-naam": 0,
  "dubbel-in-bestand": 0,
  "al-prospect": 0,
  "al-contact": 0,
  afgemeld: 0,
  "ongeldig-adres": 0,
  "rol-adres": 0,
};

const MAX_VOORBEELDEN_PER_REDEN = 10;

export function planProspectImport(rijen: ProspectRowIn[], bekend: BekendeGegevens): ImportPlan {
  const overgeslagen = { ...LEEG };
  const voorbeelden: ImportPlan["voorbeelden"] = [];
  const nieuw: NieuweProspect[] = [];
  const perReden = { ...LEEG };

  // Binnen dit bestand: gezien adressen en gezien bedrijven-zonder-adres.
  const gezienEmail = new Set<string>();
  const gezienBedrijf = new Set<string>();

  const sla = (rij: number, reden: OverslagReden, waarde: string) => {
    overgeslagen[reden]++;
    if (perReden[reden] < MAX_VOORBEELDEN_PER_REDEN) {
      perReden[reden]++;
      voorbeelden.push({ rij, reden, waarde });
    }
  };

  rijen.forEach((ruw, i) => {
    const rij = i + 1;
    const naam = (ruw.companyName ?? "").trim();
    if (!naam) {
      sla(rij, "zonder-naam", (ruw.email ?? "").trim() || "(lege regel)");
      return;
    }

    const ruwEmail = (ruw.email ?? "").trim();
    const email = normalizeEmail(ruwEmail);

    if (ruwEmail && !email) {
      // Er stond wél iets, maar het is geen adres. De rij zelf is nog bruikbaar
      // (naam, telefoon, plaats), dus die gaat mee zonder adres.
      sla(rij, "ongeldig-adres", ruwEmail);
    }

    if (email) {
      if (isRoleAddress(email)) return sla(rij, "rol-adres", email);
      if (bekend.suppressed.has(email)) return sla(rij, "afgemeld", email);
      if (bekend.contactEmails.has(email)) return sla(rij, "al-contact", email);
      if (bekend.prospectEmails.has(email)) return sla(rij, "al-prospect", email);
      if (gezienEmail.has(email)) return sla(rij, "dubbel-in-bestand", email);
      gezienEmail.add(email);
    } else {
      // Zonder adres deduperen op bedrijfsnaam + plaats, anders staat hetzelfde
      // bedrijf uit dezelfde lijst er drie keer in.
      const sleutel = prospectCompanyKey(naam, ruw.city);
      if (bekend.prospectCompanyKeys.has(sleutel)) return sla(rij, "al-prospect", naam);
      if (gezienBedrijf.has(sleutel)) return sla(rij, "dubbel-in-bestand", naam);
      gezienBedrijf.add(sleutel);
    }

    nieuw.push({ ...ruw, companyName: naam, email: email ?? undefined, rij });
  });

  return {
    nieuw,
    overgeslagen,
    voorbeelden,
    zonderEmail: nieuw.filter((n) => !n.email).length,
    totaal: rijen.length,
  };
}

/** Voor de samenvatting op het scherm: hoeveel vallen er in totaal weg. */
export function aantalOvergeslagen(plan: ImportPlan): number {
  return Object.values(plan.overgeslagen).reduce((a, b) => a + b, 0) - plan.overgeslagen["ongeldig-adres"];
}
