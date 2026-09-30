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
  /**
   * De Spaanse pagina: de beurs staat in Valencia, en de eerste dag kreeg
   * iedereen die de code scande een Engelse bevestigingsmail omdat de code naar
   * de Engelse pagina wees. De bezoeker kan de taal op het formulier zelf nog
   * omzetten.
   */
  formulierUrl: "https://www.habitat-one.com/es/beurs",
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

/**
 * Waar de bezoeker om vraagt. Bijna iedereen wil hetzelfde — stalen, prijzen,
 * beeldmateriaal — en dat stond tot nu toe ergens in de vrije tekst, waar je
 * het bij het opvolgen niet uit kon filteren. Aanvinken dus; de sleutel komt
 * als tag op het contact.
 */
export const INTERESSES = [
  { key: "stalen", nl: "Stalen / monsters", en: "Samples", es: "Muestras" },
  { key: "prijzen", nl: "Prijzen", en: "Prices", es: "Precios" },
  { key: "content", nl: "Beeld en documentatie", en: "Images and documentation", es: "Imágenes y documentación" },
  { key: "showroom", nl: "Bezoek showroom Jávea", en: "Visit our showroom in Jávea", es: "Visitar el showroom en Jávea" },
] as const;

export type InteresseKey = (typeof INTERESSES)[number]["key"];

export function interesseLabel(key: string, taal: BeursTaal = "nl"): string {
  const i = INTERESSES.find((x) => x.key === key);
  return i ? i[taal] : key;
}

/** Alleen de vinkjes die we kennen, in de vaste volgorde. */
export function schoonInteresses(keuzes: readonly string[] | null | undefined): string[] {
  return INTERESSES.filter((i) => keuzes?.includes(i.key)).map((i) => i.key);
}

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

/**
 * Hoe de bezoeker op het scherm heet. Bij "Anders" staat er wat hij dan wél is
 * ("Anders (fotograaf)") — dat veld staat er juist omdat de zes keuzes niet
 * alles vangen, en zonder de toelichting is het antwoord waardeloos.
 */
export function rolOmschrijving(rol: string, anders?: string | null, taal: BeursTaal = "nl"): string {
  const extra = anders?.trim();
  return extra ? `${rolLabel(rol, taal)} (${extra})` : rolLabel(rol, taal);
}

/** Rollen die zakelijk inkopen of doorverkopen. */
const ZAKELIJK = new Set(["architect", "ontwerper", "aannemer", "wederverkoper"]);

export function bepaalTier(args: {
  rol: string;
  bedrijf?: string | null;
  zelfIngevuld?: boolean;
}): "particulier" | "aannemer" {
  if (!ZAKELIJK.has(args.rol)) return "particulier";
  if (!args.zelfIngevuld) return "aannemer"; // wij hebben hem gesproken en ingevoerd
  return args.bedrijf?.trim() ? "aannemer" : "particulier";
}

/** Notitie op het contact: rol, beurs en wat de bezoeker wil. */
export function contactNotitie(args: {
  rol: string;
  bedrijf?: string | null;
  wens?: string | null;
  rolAnders?: string | null;
  interesses?: readonly string[] | null;
}): string {
  const regels = [
    `${rolOmschrijving(args.rol, args.rolAnders)} · ontmoet op ${BEURS.naam} (${BEURS.plaats}, stand ${BEURS.stand})`,
  ];
  if (args.bedrijf?.trim()) regels.push(`Bedrijf: ${args.bedrijf.trim()}`);
  const gevraagd = schoonInteresses(args.interesses);
  if (gevraagd.length) regels.push(`Wil: ${gevraagd.map((k) => interesseLabel(k)).join(", ")}`);
  if (args.wens?.trim()) regels.push("", args.wens.trim());
  return regels.join("\n");
}

type MailTekst = {
  onderwerp: string;
  /** Link naar de films van de stand, in dezelfde taal als de mail. */
  films: { tekst: string; knop: string; link: string };
  hallo: (naam: string) => string;
  dank: string;
  vervolg: string;
  /** Wat de bezoeker aanvinkte, zodat hij ziet dat we het genoteerd hebben. */
  gevraagd: (lijst: string) => string;
  /** Uitnodiging om meteen een account op de website te maken. */
  account: string;
  accountKnop: string;
  groet: string;
};

const MAIL: Record<BeursTaal, MailTekst> = {
  nl: {
    onderwerp: `Leuk je te ontmoeten op ${BEURS.naam}`,
    hallo: (naam) => `Beste ${naam},`,
    dank: `Bedankt voor je bezoek aan onze stand (${BEURS.stand}) op ${BEURS.naam} in ${BEURS.plaats}. Goed om je te spreken.`,
    vervolg:
      "We nemen na de beurs contact met je op om er rustig op terug te komen. Heb je eerder een vraag, antwoord dan gerust op deze mail.",
    films: {
      tekst: "De films die bij ons op het scherm liepen kun je hier bekijken — stil, met de tekst in beeld.",
      knop: "Bekijk de films",
      link: "https://www.habitat-one.com/nl/beurs/films",
    },
    gevraagd: (lijst) => `Je vroeg om ${lijst}. Dat staat genoteerd.`,
    account:
      "Wil je nu alvast rondkijken? Je account op onze website staat klaar — stel je wachtwoord in en je ziet meteen het volledige assortiment, met prijzen.",
    accountKnop: "Wachtwoord instellen",
    groet: "Tot snel,",
  },
  en: {
    onderwerp: `Great to meet you at ${BEURS.naam}`,
    hallo: (naam) => `Dear ${naam},`,
    dank: `Thank you for visiting our stand (${BEURS.stand}) at ${BEURS.naam} in ${BEURS.plaats}. It was good to speak with you.`,
    vervolg:
      "We will get in touch after the fair to follow up properly. If anything comes up before then, simply reply to this email.",
    films: {
      tekst: "The films that were playing on our screen are here — no sound, the text is on screen.",
      knop: "Watch the films",
      link: "https://www.habitat-one.com/beurs/films",
    },
    gevraagd: (lijst) => `You asked about ${lijst}. We have noted it.`,
    account:
      "Would you like to look around already? Your account on our website is ready — set your password and you will see the full range, prices included.",
    accountKnop: "Set your password",
    groet: "Talk soon,",
  },
  es: {
    onderwerp: `Un placer conocerte en ${BEURS.naam}`,
    hallo: (naam) => `Estimado/a ${naam}:`,
    dank: `Gracias por visitar nuestro stand (${BEURS.stand}) en ${BEURS.naam}, ${BEURS.plaats}. Ha sido un placer hablar contigo.`,
    vervolg:
      "Nos pondremos en contacto contigo después de la feria para retomarlo con calma. Si surge algo antes, responde a este correo.",
    films: {
      tekst: "Aquí tienes los vídeos que se veían en nuestra pantalla: sin sonido, con el texto en imagen.",
      knop: "Ver los vídeos",
      link: "https://www.habitat-one.com/es/beurs/films",
    },
    gevraagd: (lijst) => `Nos pediste ${lijst}. Queda anotado.`,
    account:
      "¿Quieres ir echando un vistazo? Tu cuenta en nuestra web está lista: crea tu contraseña y verás todo el catálogo, con precios.",
    accountKnop: "Crear contraseña",
    groet: "Hasta pronto,",
  },
};

/**
 * De bevestigingsmail. Kort en persoonlijk: één alinea over de ontmoeting, één
 * over wat er gaat gebeuren. Geen verkooppraat — die komt na de beurs.
 */
export function beursMail(args: {
  naam: string;
  taal: BeursTaal;
  wens?: string | null;
  interesses?: readonly string[] | null;
  /** Link om een wachtwoord in te stellen voor het website-account. */
  accountLink?: string | null;
}): {
  subject: string;
  alineas: string[];
  /** De films van de stand — daar vroeg iedereen om, dus ze gaan meteen mee. */
  films: { tekst: string; knop: string; link: string };
  account: { tekst: string; knop: string; link: string } | null;
  groet: string;
} {
  const t = MAIL[args.taal] ?? MAIL.nl;
  const alineas = [t.hallo(args.naam.trim().split(/\s+/)[0] || args.naam.trim()), t.dank];
  const gevraagd = schoonInteresses(args.interesses);
  if (gevraagd.length) {
    const lijst = gevraagd.map((k) => interesseLabel(k, args.taal).toLowerCase());
    alineas.push(t.gevraagd(lijst.join(", ")));
  }
  alineas.push(t.vervolg);
  alineas.push(args.taal === "es"
    ? "Adjuntamos la ficha técnica de Flexible Stone en español e inglés."
    : args.taal === "en"
      ? "Attached is the Flexible Stone technical data sheet in English and Spanish."
      : "In de bijlage vind je de technische datasheet van Flexible Stone in het Engels en Spaans.");
  return {
    subject: t.onderwerp,
    alineas,
    films: t.films,
    account: args.accountLink ? { tekst: t.account, knop: t.accountKnop, link: args.accountLink } : null,
    groet: t.groet,
  };
}
