"use client";

import { useState, useTransition } from "react";
import { Cloud } from "lucide-react";

import { buttonClass } from "@/components/ui";

import { pushAllPendingToHolded } from "./actions";

export function SyncHoldedButton({ pendingCount }: { pendingCount: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (pendingCount === 0) {
    return (
      <span className="text-xs text-muted">Alles gesynced met Holded ✓</span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              const r = await pushAllPendingToHolded();
              setResult(
                r.failed === 0
                  ? `${r.pushed} naar Holded gesynced ✓`
                  : `${r.pushed} OK · ${r.failed} mislukt — ${r.errors[0] ?? ""}`,
              );
            } catch (e) {
              setResult(e instanceof Error ? e.message : "Sync mislukt");
            }
          })
        }
        className={buttonClass({ variant: "secondary" })}
        title={`${pendingCount} inkooporders nog niet in Holded`}
      >
        <Cloud className="h-4 w-4" /> Sync naar Holded ({pendingCount})
      </button>
      {result && <span className="text-xs text-muted">{result}</span>}
    </div>
  );
}
