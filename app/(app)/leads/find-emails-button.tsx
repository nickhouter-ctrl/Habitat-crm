"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { findMissingEmails } from "./actions";

/** Zoekt alsnog e-mailadressen voor prospects zonder mail (maar mét website). */
export function FindEmailsButton({ missingCount }: { missingCount: number }) {
  const uiT = useUiTranslation();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (missingCount === 0) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await findMissingEmails();
            setMsg(`${r.found} gevonden (${r.checked} gecontroleerd)`);
          })
        }
      >
        {pending ? uiT("Zoeken…") : uiT("Zoek ontbrekende e-mails ({v0})", { v0: missingCount })}
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </span>
  );
}
