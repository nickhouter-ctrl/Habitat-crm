"use client";

/**
 * Eén beursregel weggooien — voor een testinvoer, een dubbele, of een naam die
 * er per ongeluk in kwam. Vraagt eerst of je het zeker weet en vertelt daarna
 * wat er precies verdwenen is; het contact blijft namelijk staan zodra er iets
 * aan hangt.
 */
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { useT } from "@/components/taal-provider";
import type { VerwijderResultaat } from "./actions";

export function VerwijderKnop({
  contactId,
  email,
  naam,
  verwijder,
}: {
  contactId: string | null;
  email: string;
  naam: string;
  verwijder: (formData: FormData) => Promise<VerwijderResultaat>;
}) {
  const t = useT();
  const [bezig, start] = useTransition();
  const [melding, setMelding] = useState<string | null>(null);

  if (melding) return <span className="text-xs text-muted">{melding}</span>;

  return (
    <button
      type="button"
      disabled={bezig}
      title={t("Verwijderen")}
      aria-label={t("Verwijderen")}
      className="rounded-md p-2 text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
      onClick={() => {
        if (!window.confirm(t("{naam} en alles wat we op de beurs van hem vastlegden verwijderen?", { naam }))) return;
        const fd = new FormData();
        if (contactId) fd.set("contactId", contactId);
        fd.set("email", email);
        start(async () => {
          const res = await verwijder(fd);
          setMelding(res.ok ? res.melding : res.fout);
        });
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
