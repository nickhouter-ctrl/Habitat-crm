"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";

import { sendPaymentReminderNow } from "@/app/(app)/documents/actions";
import type { ReminderLevel } from "@/lib/email";
import { cn } from "@/lib/utils";

const OPTIONS: { level?: ReminderLevel; label: string }[] = [
  { level: undefined, label: "Volgende herinnering (auto)" },
  { level: 1, label: "1e herinnering" },
  { level: 2, label: "2e herinnering" },
  { level: 3, label: "Aanmaning" },
];

/**
 * Knop om handmatig een betaalherinnering/aanmaning voor één factuur te sturen.
 * Standaard loopt het niveau automatisch op; via het menu kies je zelf een niveau.
 * Geeft inline terugkoppeling en stopt de klik (zodat een klikbare rij niet meenavigeert).
 */
export function ReminderButton({
  documentId,
  className,
}: {
  documentId: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  if (result?.ok) {
    return <span className="text-xs font-medium text-success">Verstuurd ✓</span>;
  }

  const send = (level?: ReminderLevel) => {
    setOpen(false);
    if (!window.confirm("Herinnering nu naar de klant e-mailen?")) return;
    setResult(null);
    startTransition(async () => {
      setResult(await sendPaymentReminderNow(documentId, level));
    });
  };

  return (
    <span
      className="relative inline-flex flex-col items-end gap-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50",
          className,
        )}
      >
        <Bell className="size-3.5" />
        {pending ? "Versturen…" : "Herinnering"}
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border bg-surface py-1 text-left shadow-lg">
            {OPTIONS.map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => send(o.level)}
                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-background"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {result && !result.ok && (
        <span className="max-w-44 text-right text-[11px] text-danger">{result.error}</span>
      )}
    </span>
  );
}
