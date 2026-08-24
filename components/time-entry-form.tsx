"use client";

/**
 * Uren boeken op een werf.
 *
 * Er stond hier een keuze "contant of per factuur", omdat het tarief daarvan
 * afhing. Die keuze is eruit: het gaat om het bedrag dat betaald is, niet om de
 * manier waarop. Wat blijft is het tarief zelf — en als een arbeider er twee
 * heeft, staan ze allebei als knop naast het veld.
 */
import { useState } from "react";

import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type TimeEntryWorker = {
  value: string;
  label: string;
  /** Uurtarief van zijn ploegkaart. */
  hourlyCostEur: number | null;
  /** Tweede tarief, als hij er twee heeft. */
  hourlyCostCashEur: number | null;
};

export function TimeEntryForm({
  workers,
  action,
}: {
  workers: TimeEntryWorker[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [workerId, setWorkerId] = useState("");
  const [tarief, setTarief] = useState("");

  const gekozen = workers.find((w) => w.value === workerId) ?? null;
  // Zonder dubbele waarden: heeft hij twee keer hetzelfde staan, dan is het één knop.
  const tarieven = [...new Set([gekozen?.hourlyCostEur, gekozen?.hourlyCostCashEur]
    .filter((t): t is number => typeof t === "number" && t > 0))];

  function kiesArbeider(id: string) {
    setWorkerId(id);
    const w = workers.find((x) => x.value === id) ?? null;
    const eerste = w?.hourlyCostEur ?? w?.hourlyCostCashEur ?? null;
    setTarief(eerste != null ? String(eerste) : "");
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_1fr_auto] lg:items-end">
      <Field label="Arbeider">
        <Combobox
          name="workerId"
          placeholder="Zoek een arbeider…"
          options={workers.map((w) => ({ value: w.value, label: w.label }))}
          onSelect={(v) => kiesArbeider(v)}
        />
      </Field>
      <Field label="Uren">
        <Input name="hours" inputMode="decimal" required placeholder="8" />
      </Field>
      <Field label="Datum">
        <Input name="date" type="date" required />
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        + Uren
      </SubmitButton>

      <Field
        label="Tarief (€/u)"
        className="lg:col-span-2"
        hint={gekozen && tarieven.length === 0 ? "op zijn ploegkaart staat geen tarief" : "ex. btw"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="hourlyCostEur"
            inputMode="decimal"
            className="w-28 text-right"
            value={tarief}
            onChange={(e) => setTarief(e.target.value)}
            placeholder="tarief"
          />
          {tarieven.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTarief(String(t))}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                tarief === String(t)
                  ? "border-accent bg-accent/10 text-accent"
                  : "bg-surface text-muted hover:bg-background",
              )}
            >
              € {t}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Notitie" className="lg:col-span-2">
        <Input name="note" placeholder="optioneel" />
      </Field>
    </form>
  );
}
