"use client";

import { Bell } from "lucide-react";
import { useState, useTransition } from "react";

import { sendPaymentReminderNow } from "@/app/(app)/documents/actions";
import { cn } from "@/lib/utils";

/**
 * Knop om handmatig een betaalherinnering/aanmaning voor één factuur te sturen.
 * Geeft direct inline terugkoppeling (verstuurd ✓ / foutmelding). Stopt de
 * klik zodat een omringende klikbare rij niet meenavigeert.
 */
export function ReminderButton({
  documentId,
  label = "Herinnering",
  className,
}: {
  documentId: string;
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  if (result?.ok) {
    return <span className="text-xs font-medium text-success">Verstuurd ✓</span>;
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          e.stopPropagation();
          if (!window.confirm("Betaalherinnering nu naar de klant e-mailen?")) return;
          setResult(null);
          startTransition(async () => {
            setResult(await sendPaymentReminderNow(documentId));
          });
        }}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50",
          className,
        )}
      >
        <Bell className="size-3.5" />
        {pending ? "Versturen…" : label}
      </button>
      {result && !result.ok && (
        <span className="max-w-40 text-right text-[11px] text-danger">{result.error}</span>
      )}
    </span>
  );
}
