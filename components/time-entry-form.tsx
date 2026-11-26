"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

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
import { CASH_ACTUAL_RATE_EUR, CASH_BILLED_RATE_EUR } from "@/lib/worker-rate";

export type TimeEntryWorker = {
  value: string;
  label: string;
  /** Uurtarief van zijn ploegkaart. */
  hourlyCostEur: number | null;
  /** Tweede tarief, als hij er twee heeft. */
  hourlyCostCashEur: number | null;
  /** Standaard betaalwijze van zijn ploegkaart. */
  defaultPaymentMethod?: "cash" | "invoice";
};

export function TimeEntryForm({
  workers,
  action,
}: {
  workers: TimeEntryWorker[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const uiT = useUiTranslation();
  const [workerId, setWorkerId] = useState("");
  const [tarief, setTarief] = useState("");
  const [betaalwijze, setBetaalwijze] = useState<"cash" | "invoice">("invoice");
  const [werkelijk, setWerkelijk] = useState("");

  const gekozen = workers.find((w) => w.value === workerId) ?? null;
  // Zonder dubbele waarden: heeft hij twee keer hetzelfde staan, dan is het één knop.
  const tarieven = [...new Set([gekozen?.hourlyCostEur, gekozen?.hourlyCostCashEur]
    .filter((t): t is number => typeof t === "number" && t > 0))];

  /** Contant = altijd € 28 doorberekenen en € 20 werkelijk; per factuur = tarief van de ploegkaart. */
  function zetBetaalwijze(wijze: "cash" | "invoice", w: TimeEntryWorker | null) {
    setBetaalwijze(wijze);
    if (wijze === "cash") {
      setTarief(String(CASH_BILLED_RATE_EUR));
      setWerkelijk(String(CASH_ACTUAL_RATE_EUR));
    } else {
      const eerste = w?.hourlyCostEur ?? w?.hourlyCostCashEur ?? null;
      setTarief(eerste != null ? String(eerste) : "");
      setWerkelijk("");
    }
  }

  function kiesArbeider(id: string) {
    setWorkerId(id);
    const w = workers.find((x) => x.value === id) ?? null;
    zetBetaalwijze(w?.defaultPaymentMethod ?? "invoice", w);
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.8fr_1fr_auto] lg:items-end">
      <Field label={uiT("Arbeider")}>
        <Combobox
          name="workerId"
          placeholder={uiT("Zoek een arbeider…")}
          options={workers.map((w) => ({ value: w.value, label: w.label }))}
          onSelect={(v) => kiesArbeider(v)}
        />
      </Field>
      <Field label={uiT("Uren")}>
        <Input name="hours" inputMode="decimal" required placeholder="8" />
      </Field>
      <Field label={uiT("Datum")}>
        <Input name="date" type="date" required />
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        {uiT("+ Uren")} </SubmitButton>

      <Field
        label={uiT("Tarief (€/u)")}
        className="lg:col-span-2"
        hint={gekozen && tarieven.length === 0 ? uiT("op zijn ploegkaart staat geen tarief") : uiT("ex. btw")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="hourlyCostEur"
            inputMode="decimal"
            className="w-28 text-right"
            value={tarief}
            onChange={(e) => setTarief(e.target.value)}
            placeholder={uiT("tarief")}
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
      <Field label={uiT("Betaald")} className="lg:col-span-2" hint={betaalwijze === "cash" ? uiT("contant: klant € {v0} + opslag, werkelijk € {v1}", { v0: CASH_BILLED_RATE_EUR, v1: CASH_ACTUAL_RATE_EUR }) : undefined}>
        <input type="hidden" name="paymentMethod" value={betaalwijze} />
        <div className="flex flex-wrap items-center gap-2">
          {(["invoice", "cash"] as const).map((wijze) => (
            <button
              key={wijze}
              type="button"
              onClick={() => zetBetaalwijze(wijze, gekozen)}
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                betaalwijze === wijze ? "border-accent bg-accent/10 text-accent" : "bg-surface text-muted hover:bg-background",
              )}
            >
              {wijze === "cash" ? uiT("Contant") : uiT("Per factuur")}
            </button>
          ))}
          <Input
            name="actualHourlyCostEur"
            inputMode="decimal"
            className="w-28 text-right"
            value={werkelijk}
            onChange={(e) => setWerkelijk(e.target.value)}
            placeholder={uiT("= tarief")}
            aria-label={uiT("Werkelijk betaald (€/u)")}
            title={uiT("Werkelijk betaald (€/u)")}
          />
          <span className="text-xs text-muted">{uiT("werkelijk betaald")}</span>
        </div>
      </Field>
      <Field label={uiT("Notitie")} className="lg:col-span-2">
        <Input name="note" placeholder={uiT("optioneel")} />
      </Field>
    </form>
  );
}
