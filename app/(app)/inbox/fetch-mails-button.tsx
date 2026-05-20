"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { buttonClass } from "@/components/ui";

import { fetchMails } from "./actions";

/** Knop op /inbox om handmatig nieuwe mails via IMAP op te halen. */
export function FetchMailsButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(null);
            try {
              const r = await fetchMails();
              if (!r.ok) {
                setResult(`Fout: ${r.error ?? "onbekend"}`);
              } else if ((r.inserted ?? 0) === 0) {
                setResult("Geen nieuwe mails");
              } else {
                const att = (r.attachmentsStored ?? 0) > 0 ? ` · ${r.attachmentsStored} bijlage(n)` : "";
                setResult(`${r.inserted} nieuwe mail${r.inserted === 1 ? "" : "s"}${att} ✓`);
              }
            } catch (e) {
              setResult(e instanceof Error ? e.message : "Ophalen mislukt");
            }
          })
        }
        className={buttonClass({ variant: "secondary" })}
        title="Nieuwe mails ophalen via IMAP"
      >
        <RefreshCw className={`h-4 w-4${pending ? " animate-spin" : ""}`} />
        {pending ? "Bezig…" : "Mails ophalen"}
      </button>
      {result && <span className="text-xs text-muted">{result}</span>}
    </div>
  );
}
