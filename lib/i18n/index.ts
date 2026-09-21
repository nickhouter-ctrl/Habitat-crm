/**
 * Het CRM in drie talen.
 *
 * Opzet: **de Nederlandse tekst is de sleutel**. `t("Mail-inbox")` zoekt die
 * tekst op in het woordenboek van de gekozen taal en valt anders terug op de
 * Nederlandse tekst zelf. Dat is de werkwijze van gettext, en hier om drie
 * redenen de juiste:
 *
 *  - de code blijft leesbaar (`t("Nieuwe campagne")`, geen `t("leads.new.title")`);
 *  - Nederlands werkt zonder woordenboek, dus er kan nooit ineens een
 *    sleutelnaam op het scherm staan;
 *  - een pagina is per stuk te vertalen, zonder eerst een sleutelstructuur voor
 *    het hele systeem te verzinnen. Bij 98 pagina's is dat het verschil tussen
 *    wel en niet beginnen.
 *
 * Nadeel dat we bewust accepteren: dezelfde Nederlandse tekst op twee plekken
 * krijgt dezelfde vertaling. Waar dat knelt (een los woord als "Open" dat in de
 * ene context "openstaand" en in de andere "openen" betekent) komt er een
 * verduidelijking achter een verticale streep: `t("Open|factuur")`. Alles vanaf
 * die streep is voor de vertaler en staat nooit op het scherm.
 *
 * Bewust GEEN haakjes voor die verduidelijking: `t("Alle functies ({n})")` zou
 * dan zijn variabele verliezen.
 */
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

/** Naam van het cookie met de taalkeuze — ook leesbaar vóór het inloggen. */
export const TAAL_COOKIE = "habitat-taal";

export const LOCALES = ["nl", "en", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABEL: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
  es: "Español",
};

export type Dictionary = Record<string, string>;

const WOORDENBOEKEN: Record<Locale, Dictionary> = { nl: {}, en, es };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function woordenboek(locale: Locale): Dictionary {
  return WOORDENBOEKEN[locale] ?? {};
}

/** "Open|factuur" → "Open" — de verduidelijking hoort niet op het scherm. */
function zonderContext(sleutel: string): string {
  const i = sleutel.indexOf("|");
  return i === -1 ? sleutel : sleutel.slice(0, i).trim() || sleutel;
}

/**
 * Vertaal één tekst. `vars` vult `{naam}`-plaatsen in, zodat een zin met een
 * getal of naam erin één sleutel blijft in plaats van aan elkaar geplakte
 * stukjes — dat laatste is in andere talen vaak onvertaalbaar.
 */
export function vertaal(
  locale: Locale,
  sleutel: string,
  vars?: Record<string, string | number>,
): string {
  const uit = (locale === "nl" ? undefined : woordenboek(locale)[sleutel]) ?? zonderContext(sleutel);
  if (!vars) return uit;
  return uit.replace(/\{(\w+)\}/g, (heel, naam) => (naam in vars ? String(vars[naam]) : heel));
}

export type T = (sleutel: string, vars?: Record<string, string | number>) => string;

/** Een vertaalfunctie voor één taal. */
export function maakT(locale: Locale): T {
  return (sleutel, vars) => vertaal(locale, sleutel, vars);
}
