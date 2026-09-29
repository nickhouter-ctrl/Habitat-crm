"use client";

/**
 * "Stuur de films na" — de opvolgmail met de beursfilms.
 *
 * Toont hoeveel mensen hem nog niet hebben, vraagt of je het zeker weet (het
 * gaat om tientallen mails naar echte klanten) en zegt daarna wat er is
 * gebeurd. Bij meer dan één portie klik je nog een keer.
 */
import { useState, useTransition } from "react";
import { Clapperboard } from "lucide-react";

import { useT } from "@/components/taal-provider";
import type { VerwijderResultaat } from "./actions";

export function FilmmailKnop({
  open,
  versturen,
}: {
  open: number;
  versturen: () => Promise<VerwijderResultaat>;
}) {
  const t = useT();
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={bezig || open === 0}
        className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        onClick={() => {
          if (!window.confirm(t("De films naar {n} klant(en) mailen?", { n: open }))) return;
          start(async () => {
            const res = await versturen();
            setMelding(res.ok ? res.melding : res.fout);
          });
        }}
      >
        <Clapperboard className="size-4" />
        {bezig ? t("Versturen…") : open === 0 ? t("Iedereen heeft de films gehad") : t("Films mailen ({n})", { n: open })}
      </button>
      {melding && <span className="text-sm text-muted">{melding}</span>}
    </div>
  );
}
