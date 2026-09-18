"use client";

import { createContext, useContext, useMemo } from "react";

import { vertaal, type Locale, type T } from "@/lib/i18n";

/**
 * De taal voor client-componenten (zijbalk, formulieren, tegels).
 *
 * Alleen de taalcode gaat over de lijn, niet het woordenboek: de woordenboeken
 * zitten al in de clientbundel doordat `lib/i18n` ze importeert. Ze ook als
 * prop meesturen zou dezelfde tekst twee keer over de lijn sturen bij elke
 * paginanavigatie.
 */
const Ctx = createContext<Locale>("nl");

export function TaalProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useT(): T {
  const locale = useContext(Ctx);
  return useMemo<T>(() => (sleutel, vars) => vertaal(locale, sleutel, vars), [locale]);
}

export function useLocale(): Locale {
  return useContext(Ctx);
}
