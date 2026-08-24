"use client";

/**
 * Uren boeken op een werf.
 *
 * Het tarief hangt af van hóé je betaalt: contant werken gaat vaak tegen een
 * ander tarief dan op factuur. Dat stond eerder als twee ploegkaarten met
 * dezelfde naam in de lijst, met als gevolg dat iemands uren over twee kaarten
 * verspreid raakten. Nu heeft een arbeider twee tarieven en volgt het veld de
 * betaalwijze — met de mogelijkheid er zelf iets anders in te zetten.
 */
import { useState } from "react";

import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select } from "@/components/ui";
import { workerRate } from "@/lib/worker-rate";

export type TimeEntryWorker = {
  value: string;
  label: string;
  /** Tarief per factuur. */
  hourlyCostEur: number | null;
  /** Tarief contant; leeg = zelfde als per factuur. */
  hourlyCostCashEur: number | null;
  defaultPaymentMethod: "cash" | "invoice";
};

export function TimeEntryForm({
  workers,
  action,
}: {
  workers: TimeEntryWorker[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [workerId, setWorkerId] = useState("");
  const [betaling, setBetaling] = useState<"cash" | "invoice">("cash");
  const [tarief, setTarief] = useState("");
  const [zelfGetypt, setZelfGetypt] = useState(false);

  const gekozen = workers.find((w) => w.value === workerId) ?? null;
  const standaard = workerRate(gekozen, betaling);

  function vulTarief(w: TimeEntryWorker | null, methode: "cash" | "invoice") {
    if (zelfGetypt) return;
    const r = workerRate(w, methode);
    setTarief(r != null ? String(r) : "");
  }

  function kiesArbeider(id: string) {
    setWorkerId(id);
    const w = workers.find((x) => x.value === id) ?? null;
    // Zijn standaard betaalwijze meenemen: iemand die altijd contant werkt hoeft
    // dat niet elke keer om te zetten.
    const methode = w?.defaultPaymentMethod ?? betaling;
    setBetaling(methode);
    vulTarief(w, methode);
  }

  function kiesBetaling(methode: "cash" | "invoice") {
    setBetaling(methode);
    vulTarief(gekozen, methode);
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.9fr_1fr_auto] lg:items-end">
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
      <Field label="Betaling">
        <Select
          name="paymentMethod"
          value={betaling}
          onChange={(e) => kiesBetaling(e.target.value as "cash" | "invoice")}
        >
          <option value="cash">Contant</option>
          <option value="invoice">Per factuur</option>
        </Select>
      </Field>
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">
        + Uren
      </SubmitButton>
      <Field
        label="Tarief (€/u)"
        className="lg:col-span-2"
        hint={
          gekozen
            ? standaard != null
              ? `zijn tarief ${betaling === "cash" ? "contant" : "per factuur"} is € ${standaard}/u — pas aan als het deze keer anders is`
              : "op zijn ploegkaart staat geen tarief; vul het hier in"
            : "kies een arbeider, dan volgt zijn tarief"
        }
      >
        <Input
          name="hourlyCostEur"
          inputMode="decimal"
          value={tarief}
          onChange={(e) => {
            setTarief(e.target.value);
            setZelfGetypt(true);
          }}
          placeholder="overschrijf tarief"
        />
      </Field>
      <Field label="Notitie" className="lg:col-span-3">
        <Input name="note" placeholder="optioneel" />
      </Field>
    </form>
  );
}
