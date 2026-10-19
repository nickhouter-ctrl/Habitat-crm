"use client";

import type { MouseEvent } from "react";
import { SubmitButton } from "@/components/submit-button";

const stop = (e: MouseEvent) => e.stopPropagation();

/**
 * Afvinken vanuit de lijst. De rij zelf is een link naar de aanvraag, dus elke
 * klik hier mag niet doorbubbelen naar de rij.
 */
export function AanvraagRijActies({ open, afhandelen, afwijzen, heropenen, labels }: {
  open: boolean;
  afhandelen: () => Promise<void>;
  afwijzen: () => Promise<void>;
  heropenen: () => Promise<void>;
  labels: { afhandelen: string; afwijzen: string; heropenen: string };
}) {
  const knop = "size-7 rounded-full border p-0 text-sm";
  if (!open) {
    return (
      <form action={heropenen} onClick={stop}>
        <SubmitButton size="sm" variant="ghost" pendingLabel="…" className={knop} title={labels.heropenen} aria-label={labels.heropenen}>↺</SubmitButton>
      </form>
    );
  }
  return (
    <div className="flex gap-1.5" onClick={stop}>
      <form action={afhandelen}>
        <SubmitButton size="sm" variant="ghost" pendingLabel="…" className={`${knop} hover:bg-success/10 hover:text-success`} title={labels.afhandelen} aria-label={labels.afhandelen}>✓</SubmitButton>
      </form>
      <form action={afwijzen}>
        <SubmitButton size="sm" variant="ghost" pendingLabel="…" className={`${knop} text-muted hover:bg-danger/10 hover:text-danger`} title={labels.afwijzen} aria-label={labels.afwijzen}>✕</SubmitButton>
      </form>
    </div>
  );
}
