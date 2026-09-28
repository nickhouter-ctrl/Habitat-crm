/**
 * Beursstand: bezoekers vastleggen.
 *
 * Wat hier staat is puur — de rollen, de teksten van de bevestigingsmail en de
 * manier waarop een bezoeker een contact wordt. De pagina en de actie gebruiken
 * het; zo is de inhoud te testen zonder database of mailserver.
 *
 * Eén beurs tegelijk: de gegevens van de stand staan in BEURS. Voor de volgende
 * beurs is dat één blok aanpassen (of, als het er meer worden, een tabel — maar
 * dat is nu bedacht werk voor een probleem dat er niet is).
 */

/** De beurs waar we nu staan. */
export const BEURS = {
  naam: "360 by Cevisama",
  plaats: "Feria Valencia",
  stand: "C109",
  van: "2026-09-28",
  tot: "2026-10-01",
  /** Bron op het contact en op de aanvraag — waaraan je ze later terugvindt. */
  bron: "beurs:360-cevisama-2026",
  /**
   * Waar de QR-code naartoe wijst: het formulier op onze eigen website, niet op
   * het CRM. Een bezoeker scant en ziet habitat-one.com — de gegevens gaan via
   * de bestaande website→CRM-koppeling naar binnen, het CRM zelf blijft dicht.
   */
  formulierUrl: "https://www.habitat-one.com/beurs",
  /** Wat er onder de QR-code staat — korter leest prettiger dan de volle URL. */
  formulierLabel: "habitat-one.com/beurs",
  /**
   * Hetzelfde formulier, maar zoals wij het op de iPad op de balie gebruiken:
   * groot, zonder menu, en na het opslaan meteen leeg voor de volgende. Zo
   * hoeft het CRM niet open te staan op een apparaat dat de hele dag onbeheerd
   * op een beursvloer ligt — die pagina kan alleen gegevens ópsturen.
   */
  standUrl: "https://www.habitat-one.com/nl/beurs?stand=1",
} as const;

/** Wat voor bezoeker het is. De sleutel komt als tag op het contact te staan. */
export const ROLLEN = [
  { key: "architect", nl: "Architect", en: "Architect", es: "Arquitecto" },
  { key: "ontwerper", nl: "Ontwerper / interieur", en: "Designer / interior", es: "Diseñador / interiorismo" },
  { key: "aannemer", nl: "Aannemer / bouwer", en: "Contractor / builder", es: "Constructor" },
  { key: "wederverkoper", nl: "Wil ons verkopen", en: "Wants to resell our products", es: "Quiere vender nuestros productos" },
  { key: "particulier", nl: "Particulier", en: "Private client", es: "Cliente particular" },
  { key: "anders", nl: "Anders", en: "Other", es: "Otro" },
] as const;

export type RolKey = (typeof ROLLEN)[number]["key"];
export type BeursTaal = "nl" | "en" | "es";

export function rolLabel(key: string, taal: BeursTaal = "nl"): string {
  const r = ROLLEN.find((x) => x.key === key);
  return r ? r[taal] : key;
}

/**
 * Het soort contact dat hierbij hoort. Wie ons assortiment wil verkopen is een
 * wederverkoper (die krijgt dealerprijzen); de rest is een lead tot er iets uit
 * komt. Architecten en ontwerpers bewust óók lead: zij kopen zelf niet, maar
 * schrijven ons wel voor — hun rol staat als tag op het contact.
 */
export function contactSoort(rol: string): "reseller" | "lead" {
  return rol === "wederverkoper" ? "reseller" : "lead";
}

/** Notitie op het contact: rol, beurs en wat de bezoeker wil. */
export function contactNotitie(args: { rol: string; bedrijf?: string | null; wens?: string | null }): string {
  const regels = [
    `${rolLabel(args.rol)} · ontmoet op ${BEURS.naam} (${BEURS.plaats}, stand ${BEURS.stand})`,
  ];
  if (args.bedrijf?.trim()) regels.push(`Bedrijf: ${args.bedrijf.trim()}`);
  if (args.wens?.trim()) regels.push("", args.wens.trim());
  return regels.join("\n");
}

type MailTekst = {
  onderwerp: string;
  hallo: (naam: string) => string;
  dank: string;
  vervolg: string;
  groet: string;
};

const MAIL: Record<BeursTaal, MailTekst> = {
  nl: {
    onderwerp: `Leuk je te ontmoeten op ${BEURS.naam}`,
    hallo: (naam) => `Beste ${naam},`,
    dank: `Bedankt voor je bezoek aan onze stand (${BEURS.stand}) op ${BEURS.naam} in ${BEURS.plaats}. Goed om je te spreken.`,
    vervolg:
      "We nemen na de beurs contact met je op om er rustig op terug te komen. Heb je eerder een vraag, antwoord dan gerust op deze mail.",
    groet: "Tot snel,",
  },
  en: {
    onderwerp: `Great to meet you at ${BEURS.naam}`,
    hallo: (naam) => `Dear ${naam},`,
    dank: `Thank you for visiting our stand (${BEURS.stand}) at ${BEURS.naam} in ${BEURS.plaats}. It was good to speak with you.`,
    vervolg:
      "We will get in touch after the fair to follow up properly. If anything comes up before then, simply reply to this email.",
    groet: "Talk soon,",
  },
  es: {
    onderwerp: `Un placer conocerte en ${BEURS.naam}`,
    hallo: (naam) => `Estimado/a ${naam}:`,
    dank: `Gracias por visitar nuestro stand (${BEURS.stand}) en ${BEURS.naam}, ${BEURS.plaats}. Ha sido un placer hablar contigo.`,
    vervolg:
      "Nos pondremos en contacto contigo después de la feria para retomarlo con calma. Si surge algo antes, responde a este correo.",
    groet: "Hasta pronto,",
  },
};

/**
 * De bevestigingsmail. Kort en persoonlijk: één alinea over de ontmoeting, één
 * over wat er gaat gebeuren. Geen verkooppraat — die komt na de beurs.
 */
export function beursMail(args: { naam: string; taal: BeursTaal; wens?: string | null }): {
  subject: string;
  alineas: string[];
  groet: string;
} {
  const t = MAIL[args.taal] ?? MAIL.nl;
  const alineas = [t.hallo(args.naam.trim().split(/\s+/)[0] || args.naam.trim()), t.dank, t.vervolg];
  return { subject: t.onderwerp, alineas, groet: t.groet };
}
