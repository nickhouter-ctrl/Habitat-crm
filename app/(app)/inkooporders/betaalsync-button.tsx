"use client";

import { useState, useTransition } from "react";
import { Euro } from "lucide-react";

import { buttonClass } from "@/components/ui";

import { syncPurchasePayments } from "./actions";

/** Haalt de betaalstatus van gekoppelde inkooporders op uit Holded. */
export function BetaalsyncButton({ openCount }: { openCount: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (openCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await syncPurchasePayments();
              const parts = [
                r.fullyPaid > 0 ? `${r.fullyPaid} betaald` : null,
                r.partial > 0 ? `${r.partial} deels` : null,
                r.issues.length > 0 ? `${r.issues.length} te controleren` : null,
              ].filter(Boolean);
              setResult(
                parts.length
                  ? `${parts.join(" · ")} ✓`
                  : `Geen nieuwe betalingen (${r.checked} gecontroleerd)`,
              );
            } catch (e) {
              setResult(e instanceof Error ? e.message : "Betaalsync mislukt");
            }
          })
        }
        className={buttonClass({ variant: "secondary" })}
        title={`Betaalstatus van ${openCount} openstaande gekoppelde inkooporders ophalen uit Holded`}
      >
        <Euro className="h-4 w-4" />
        {pending ? "Betalingen ophalen…" : "Betalingen ophalen"}
      </button>
      {result && <span className="text-xs text-muted">{result}</span>}
    </div>
  );
}
