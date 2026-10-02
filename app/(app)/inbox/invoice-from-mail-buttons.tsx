"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState, useTransition } from "react";
import { Receipt } from "lucide-react";

import { createPurchaseInvoiceFromMail } from "./actions";

/**
 * Knoppen om uit een mail-bijlage een inkoopfactuur of proforma te maken.
 * Client-side: toont een pending-state en de uitkomst (incl. een eventuele
 * Holded-foutmelding), zodat een mislukte push niet meer stil voorbijgaat en
 * dubbel klikken niet kan.
 */
export function InvoiceFromMailButtons({
  emailId,
  attachmentId,
}: {
  emailId: string;
  attachmentId: string;
}) {
  const uiT = useUiTranslation();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (asProforma: boolean) =>
    start(async () => {
      setResult(null);
      try {
        const r = await createPurchaseInvoiceFromMail({ emailId, attachmentId, asProforma });
        if ("error" in r) {
          setResult({ ok: false, text: r.error });
        } else {
          setResult({ ok: true, text: `${asProforma ? "Proforma" : "Inkoopfactuur"} aangemaakt ✓` });
        }
      } catch (e) {
        setResult({ ok: false, text: e instanceof Error ? e.message : "Mislukt" });
      }
    });

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => run(false)}
        className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
        title={uiT("Inkoopfactuur aanmaken + naar Holded sturen")}
      >
        <Receipt className="mr-1 inline h-3 w-3" /> {pending ? uiT("Bezig…") : uiT("Inkoopfactuur")}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(true)}
        className="rounded-md bg-background-soft px-2 py-1 text-xs font-medium text-muted hover:bg-border disabled:opacity-50"
        title={uiT("Proforma toevoegen — concept-inkooporder dat op goedkeuring wacht")}
      >
        <Receipt className="mr-1 inline h-3 w-3" /> {uiT("Proforma")} </button>
      {result && (
        <span className={`text-xs ${result.ok ? "text-success" : "text-danger"}`}>{result.text}</span>
      )}
    </span>
  );
}
