"use client";

/**
 * Waarschuwing in stap 2 van de offerte-wizard: verschijnt zodra er ná de
 * laatste berekening iets in het formulier is gewijzigd (extra badkamer,
 * andere maat, aangepast aantal). De bedragen eronder zijn dan nog van de
 * vorige berekening. Blijft bovenin plakken tijdens het scrollen en heeft
 * zijn eigen herreken-knop, zodat het niet te missen is.
 */
import { useEffect, useState } from "react";

export function OngerekendeWijzigingen({ formId }: { formId: string }) {
  const [gewijzigd, setGewijzigd] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    const markeer = () => setGewijzigd(true);
    form.addEventListener("input", markeer);
    return () => form.removeEventListener("input", markeer);
  }, [formId]);

  if (!gewijzigd) return null;
  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/50 bg-warning/15 px-3 py-2 text-sm font-medium shadow-md backdrop-blur">
      <span>⚠ Gewijzigde invoer is nog niet doorgerekend — de bedragen hieronder zijn van de vorige berekening.</span>
      <button type="submit" className="rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background hover:opacity-90">
        Nu herrekenen
      </button>
    </div>
  );
}
