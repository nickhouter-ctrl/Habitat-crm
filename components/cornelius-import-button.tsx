"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { importCorneliusProducts } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui";

export function CorneliusImportButton({ total }: { total: number }) {
  const uiT = useUiTranslation();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ added: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setResult(null);
    start(async () => {
      try {
        const r = await importCorneliusProducts();
        setResult(r);
        router.refresh();
      } catch {
        setError("Importeren mislukt — probeer het later opnieuw.");
      }
    });
  };

  return (
    <div className="space-y-3">
      <Button onClick={run} disabled={pending}>
        {pending ? uiT("Bezig met importeren…") : uiT("Importeer {v0} producten", { v0: total })}
      </Button>

      {result && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <p className="font-medium text-success">{uiT("Import klaar ✓")}</p>
          <p className="text-muted">
            {result.added} {uiT("nieuw toegevoegd ·")} {result.skipped} {uiT("overgeslagen (bestond al) ·")} {result.total} {uiT("in de lijst")} </p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{error}</div>
      )}
    </div>
  );
}
