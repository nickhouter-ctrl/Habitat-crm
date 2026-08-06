"use client";

/**
 * Waarschuwing in stap 2 van de offerte-wizard: verschijnt zodra er ná de
 * laatste berekening iets in het formulier is gewijzigd (extra badkamer,
 * andere maat, aangepast aantal). De bedragen eronder zijn dan nog van de
 * vorige berekening — één klik op "Voorbeeld bijwerken" rekent alles opnieuw.
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
    <p className="rounded-md bg-warning/10 px-3 py-2 text-sm font-medium">
      ⚠ Je hebt iets gewijzigd dat nog niet is doorgerekend — de bedragen hieronder zijn van de vorige berekening. Klik
      op <strong>&ldquo;Voorbeeld bijwerken&rdquo;</strong> om alles opnieuw te rekenen.
    </p>
  );
}
