"use client";

/**
 * "Er staan dubbelen in de lijst" — met één knop weg.
 *
 * Alleen zichtbaar als er echt iets te doen is, en met het aantal erbij zodat
 * je weet waar je ja op zegt. Na afloop staat er wat er is opgeruimd.
 */
import { useState, useTransition } from "react";
import { CopyX } from "lucide-react";

import { useT } from "@/components/taal-provider";
import type { VerwijderResultaat } from "./actions";

export function OpruimKnop({
  aantal,
  opruimen,
}: {
  aantal: number;
  opruimen: () => Promise<VerwijderResultaat>;
}) {
  const t = useT();
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  if (melding) return <span className="text-sm text-muted">{melding}</span>;
  if (aantal === 0) return null;

  return (
    <button
      type="button"
      disabled={bezig}
      className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50/70 px-3 py-1.5 text-sm text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(t("{n} dubbele invoer(en) opruimen? De oudste blijft staan.", { n: aantal }))) return;
        start(async () => {
          const res = await opruimen();
          setMelding(res.ok ? res.melding : res.fout);
        });
      }}
    >
      <CopyX className="size-4" />
      {bezig ? t("Bezig…") : t("{n} dubbele invoer(en) opruimen", { n: aantal })}
    </button>
  );
}
