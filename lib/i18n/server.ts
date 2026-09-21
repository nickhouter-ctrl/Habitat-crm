/**
 * De taal van de ingelogde medewerker, serverkant. Eén query per verzoek dank
 * zij `cache()`, net als bij de rol.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";

import { huidigeToegangOfNull } from "@/lib/auth/access";
import { isLocale, maakT, TAAL_COOKIE, woordenboek, type Dictionary, type Locale, type T } from "@/lib/i18n";

/**
 * De taal van dit verzoek: de instelling van de ingelogde medewerker, en als
 * er niemand is ingelogd het cookie. Dat laatste is er voor het inlogscherm —
 * wie de taal daar kiest, moet de knoppen ook in die taal zien.
 */
export const huidigeTaal = cache(async (): Promise<Locale> => {
  const t = await huidigeToegangOfNull();
  if (isLocale(t?.locale)) return t.locale;
  const uitCookie = (await cookies()).get(TAAL_COOKIE)?.value;
  return isLocale(uitCookie) ? uitCookie : "nl";
});

/** `const t = await tekst();` en daarna `t("Mail-inbox")`. */
export async function tekst(): Promise<T> {
  return maakT(await huidigeTaal());
}

/**
 * De taalcode voor `toLocaleDateString` en `Intl`. Datums en getallen komen uit
 * Intl en niet uit het woordenboek: "18 september 2026" hoort in het Spaans
 * "18 de septiembre de 2026" te zijn, en dat kan Intl beter dan wij.
 */
export async function datumTaal(): Promise<string> {
  const map: Record<Locale, string> = { nl: "nl-NL", en: "en-GB", es: "es-ES" };
  return map[await huidigeTaal()];
}

/** Taal plus woordenboek, om aan de client-laag door te geven. */
export async function taalBundel(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await huidigeTaal();
  return { locale, dict: woordenboek(locale) };
}
