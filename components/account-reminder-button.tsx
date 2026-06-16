"use client";

import { Bell, ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";

import { sendAccountReminder } from "@/app/(app)/documents/actions";
import type { ReminderLevel } from "@/lib/email";

const OPTIONS: { level?: ReminderLevel; label: string }[] = [
  { level: undefined, label: "Volgende niveau (auto)" },
  { level: 1, label: "1e herinnering" },
  { level: 2, label: "2e herinnering" },
  { level: 3, label: "Aanmaning" },
];

/**
 * Stuur in één mail een totaaloverzicht van alle openstaande facturen (en
 * openstaande creditnota's) van deze klant. Niveau loopt automatisch op, of kies zelf.
 */
export function AccountReminderButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const send = (level?: ReminderLevel) => {
    setOpen(false);
    if (!window.confirm("Eén verzamelmail met alle openstaande posten naar de klant sturen?")) return;
    setResult(null);
    startTransition(async () => {
      setResult(await sendAccountReminder(contactId, level));
    });
  };

  return (
    <div className="relative inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        <Bell className="size-4" />
        {pending ? "Versturen…" : "Stuur verzamelherinnering"}
        <ChevronDown className="size-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border bg-surface py-1 shadow-lg">
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

      {result && (
        <span className={`text-xs ${result.ok ? "text-success" : "text-danger"}`}>
          {result.ok ? "Verstuurd ✓" : result.error}
        </span>
      )}
    </div>
  );
}
