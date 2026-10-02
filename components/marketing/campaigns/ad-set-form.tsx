"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

/**
 * Formulier voor een advertentieset (brief §7): naam, taal + doelgroep-as
 * (§8c), budgetvorm, looptijd en optionele dagdelen. De harde validatie
 * draait server-side (`validateAdSetScheduling`); dit formulier legt de
 * regels alvast uit zodat het team niet tegen de muur aanloopt.
 */
import { useActionState, useState } from "react";

import { saveAdSet, type CampaignActionState } from "@/app/(app)/marketing/campaigns/actions";
import { Card, Field, Input, buttonClass } from "@/components/ui";
import { toMadridInputValue } from "./schedule";

const DAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "ma" },
  { value: 2, label: "di" },
  { value: 3, label: "wo" },
  { value: 4, label: "do" },
  { value: 5, label: "vr" },
  { value: 6, label: "za" },
  { value: 0, label: "zo" },
];

export interface AdSetFormValues {
  id?: string;
  name?: string;
  locale?: string;
  audienceSegment?: string | null;
  startTime?: Date | null;
  endTime?: Date | null;
  dailyBudgetEur?: string | null;
  lifetimeBudgetEur?: string | null;
  dayparting?: Array<{ days: number[]; start_minute: number; end_minute: number }> | null;
}

export function AdSetForm({
  campaignId,
  initial,
  onDone,
}: {
  campaignId: string;
  initial?: AdSetFormValues;
  /** Optioneel: sluit een inline-editor na opslaan (client-side). */
  onDone?: () => void;
}) {
  const uiT = useUiTranslation();
  const [state, action, pending] = useActionState<CampaignActionState, FormData>(
    saveAdSet,
    {},
  );
  const firstBlock = initial?.dayparting?.[0];
  const [budgetType, setBudgetType] = useState(initial?.lifetimeBudgetEur ? "lifetime" : "daily");
  const [daypartEnabled, setDaypartEnabled] = useState(!!firstBlock);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      {initial?.id && <input type="hidden" name="adSetId" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={uiT("Naam")} htmlFor="as-name">
          <Input id="as-name" name="name" required defaultValue={initial?.name ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={uiT("Taal")} htmlFor="as-locale">
            <select
              id="as-locale"
              name="locale"
              defaultValue={initial?.locale ?? "es"}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="es">{uiT("Spaans")}</option>
              <option value="nl">Nederlands</option>
              <option value="en">{uiT("Engels")}</option>
              <option value="de">{uiT("Duits")}</option>
            </select>
          </Field>
          <Field
            label={uiT("Doelgroep-as")}
            htmlFor="as-segment"
            hint={uiT("Lokaal of expat — hierlangs leert de leerlaag.")}
          >
            <select
              id="as-segment"
              name="audienceSegment"
              required
              defaultValue={initial?.audienceSegment ?? ""}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="" disabled>
                {uiT("Kies…")} </option>
              <option value="local_es">{uiT("Lokaal (Spaans)")}</option>
              <option value="expat_nl">{uiT("Expat NL")}</option>
              <option value="expat_en">{uiT("Expat EN")}</option>
              <option value="expat_de">{uiT("Expat DE")}</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={uiT("Budgetvorm")} htmlFor="as-budget-type">
          <select
            id="as-budget-type"
            name="budgetType"
            value={budgetType}
            onChange={(e) => setBudgetType(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="daily">{uiT("Dagbudget")}</option>
            <option value="lifetime">{uiT("Looptijdbudget (lifetime)")}</option>
          </select>
        </Field>
        <Field
          label={budgetType === "daily" ? uiT("Budget per dag (€)") : uiT("Budget totale looptijd (€)")}
          htmlFor="as-budget"
        >
          <Input
            id="as-budget"
            name="budgetEur"
            required
            inputMode="decimal"
            placeholder="25,00"
            defaultValue={initial?.dailyBudgetEur ?? initial?.lifetimeBudgetEur ?? ""}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={uiT("Start (Madrid-tijd)")} htmlFor="as-start">
            <Input
              id="as-start"
              name="startTime"
              type="datetime-local"
              defaultValue={toMadridInputValue(initial?.startTime)}
            />
          </Field>
          <Field
            label={uiT("Einde (Madrid-tijd)")}
            htmlFor="as-end"
            hint={budgetType === "lifetime" ? uiT("Verplicht bij een looptijdbudget.") : undefined}
          >
            <Input
              id="as-end"
              name="endTime"
              type="datetime-local"
              required={budgetType === "lifetime"}
              defaultValue={toMadridInputValue(initial?.endTime)}
            />
          </Field>
        </div>
      </div>

      <fieldset className="rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="daypartEnabled"
              checked={daypartEnabled}
              onChange={(e) => setDaypartEnabled(e.target.checked)}
              className="size-4"
            />
            {uiT("Dagdelen (alleen op vaste tijden tonen)")} </label>
        </legend>
        {daypartEnabled ? (
          <div className="mt-2 space-y-3">
            {budgetType !== "lifetime" && (
              <p className="rounded bg-amber-50 px-2 py-1.5 text-xs text-warning" role="alert">
                {uiT("Dagdelen vereisen een looptijdbudget — zet de budgetvorm op “Looptijdbudget”, anders weigert Meta de advertentieset.")} </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">{uiT("Dagen:")}</span>
              {DAYS.map((d) => (
                <label key={d.value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="daypartDays"
                    value={d.value}
                    defaultChecked={
                      firstBlock ? firstBlock.days.includes(d.value) : d.value >= 1 && d.value <= 5
                    }
                    className="size-4"
                  />
                  {uiT(d.label)}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="as-dp-start">{uiT("Van")}</label>
              <select
                id="as-dp-start"
                name="daypartStart"
                defaultValue={firstBlock ? firstBlock.start_minute / 60 : 9}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <label htmlFor="as-dp-end">{uiT("tot")}</label>
              <select
                id="as-dp-end"
                name="daypartEnd"
                defaultValue={firstBlock ? firstBlock.end_minute / 60 : 21}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted">{uiT("(Madrid-tijd)")}</span>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">
            {uiT("Uit: de advertenties draaien de hele dag binnen de looptijd.")} </p>
        )}
      </fieldset>

      {state.error && (
        <Card className="border-red-300 bg-red-50 p-3 text-sm" role="alert">
          <p className="font-medium">{uiT(state.error ?? "")}</p>
          {state.errors && state.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass()}>
          {pending ? uiT("Opslaan…") : initial?.id ? uiT("Wijzigingen opslaan") : uiT("Advertentieset aanmaken")}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className={buttonClass({ variant: "ghost" })}>
            {uiT("Annuleer")} </button>
        )}
        <p className="text-xs text-muted">
          {uiT("Tijden zijn Europe/Madrid; Meta rekent in de tijdzone van het advertentie-account — controleer die in Business Manager.")} </p>
      </div>
    </form>
  );
}
