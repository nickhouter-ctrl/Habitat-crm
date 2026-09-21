"use client";

import { useTransition } from "react";
import { Languages } from "lucide-react";

import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Taal kiezen, zichtbaar in de bovenbalk en op het inlogscherm.
 *
 * Stond eerst alleen weggestopt in Instellingen → Account. Wie het systeem niet
 * in zijn eigen taal ziet, kan dat menu juist niet vinden — dus hoort de keuze
 * bovenaan, en ook al vóór het inloggen.
 *
 * Drie talen, dus knoppen en geen uitklaplijst: één klik in plaats van twee.
 */
export function TaalKeuze({
  huidig,
  zet,
  className,
  compact = false,
}: {
  huidig: Locale;
  zet: (locale: string) => Promise<void>;
  className?: string;
  /** Alleen de codes (NL · EN · ES), voor de bovenbalk. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className={cn("flex items-center gap-1", className)} role="group" aria-label="Taal">
      {!compact && <Languages className="mr-1 size-4 shrink-0 text-muted" aria-hidden />}
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending || l === huidig}
          onClick={() => start(() => zet(l))}
          aria-current={l === huidig ? "true" : undefined}
          title={LOCALE_LABEL[l]}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            l === huidig
              ? "bg-accent/10 text-accent"
              : "text-muted hover:bg-background hover:text-foreground disabled:opacity-50",
          )}
        >
          {compact ? l.toUpperCase() : LOCALE_LABEL[l]}
        </button>
      ))}
    </div>
  );
}
