"use client";

import { Archive, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/components/ui";

/**
 * Selectiebalk boven de maillijst. Staat sámen met de checkbox-kolom in één
 * <form>; de checkboxes zijn gewone formuliervelden (name="ids"), dus de
 * server-actions krijgen de selectie vanzelf mee — dit component doet alleen
 * de teller, "alles selecteren" en de bevestiging bij verwijderen.
 */
export function BulkMailBar({
  archiveAction,
  deleteAction,
}: {
  archiveAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [totaal, setTotaal] = useState(0);

  const boxes = () =>
    Array.from(
      ref.current
        ?.closest("form")
        ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][name="ids"]') ?? [],
    );

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const update = () => {
      const alle = boxes();
      setTotaal(alle.length);
      setCount(alle.filter((b) => b.checked).length);
    };
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  const toggleAll = (checked: boolean) => {
    for (const b of boxes()) b.checked = checked;
    setCount(checked ? boxes().length : 0);
  };

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={totaal > 0 && count === totaal}
          onChange={(e) => toggleAll(e.target.checked)}
          className="size-4 rounded border bg-background"
          aria-label="Alles selecteren"
        />
        <span className="text-muted">
          {count > 0 ? `${count} geselecteerd` : "Selecteer mails"}
        </span>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="submit"
          formAction={archiveAction}
          disabled={count === 0}
          className={buttonClass({ variant: "secondary", size: "sm", className: "disabled:opacity-40" })}
        >
          <Archive className="size-4" /> Archiveren{count > 0 ? ` (${count})` : ""}
        </button>
        <button
          type="submit"
          formAction={deleteAction}
          disabled={count === 0}
          onClick={(e) => {
            if (
              !confirm(
                `${count} mail${count === 1 ? "" : "s"} definitief verwijderen?\n\nBijlagen van deze mails verdwijnen ook uit het Archief. Mails die aan een inkooporder of aanvraag gelinkt zijn worden overgeslagen.`,
              )
            )
              e.preventDefault();
          }}
          className={buttonClass({ variant: "secondary", size: "sm", className: "text-danger disabled:opacity-40" })}
        >
          <Trash2 className="size-4" /> Verwijderen{count > 0 ? ` (${count})` : ""}
        </button>
      </div>
    </div>
  );
}
