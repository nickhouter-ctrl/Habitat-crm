"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";

import { maakAanmeldlink } from "@/app/klant/actions";
import { buttonClass } from "@/components/ui";

/**
 * Maakt een deelbare klant-aanmeldlink (14 dagen geldig) en zet hem op het
 * klembord — om in WhatsApp te plakken. De klant vult zelf zijn gegevens in
 * en staat daarna als klant in het CRM, ingelogd op het portaal.
 */
export function AanmeldlinkKnop() {
  const [pending, start] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={buttonClass({ variant: "secondary" })}
        title="Deelbare link (14 dagen geldig) waarmee een nieuwe klant zelf zijn gegevens invult — plak hem bv. in WhatsApp."
        onClick={() =>
          start(async () => {
            try {
              const url = await maakAanmeldlink();
              await navigator.clipboard.writeText(url);
              setMelding("Link gekopieerd ✓ — plak hem in WhatsApp");
            } catch {
              setMelding("Kopiëren mislukt");
            }
          })
        }
      >
        <Link2 className="h-4 w-4" />
        {pending ? "Bezig…" : "Aanmeldlink"}
      </button>
      {melding && <span className="text-xs text-muted">{melding}</span>}
    </span>
  );
}
