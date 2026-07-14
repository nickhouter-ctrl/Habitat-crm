"use client";

import { useActionState, useRef } from "react";

import { logHours, type LogHoursState } from "@/app/uren/[token]/actions";
import type { PortalStrings } from "@/lib/worker-portal";

const QUICK_HOURS = ["4", "6", "8", "10"];

/**
 * Mobiel-eerst urenformulier voor het zzp-portaal: datum, uren, klaar. Het
 * project ligt vast in de link. Grote knoppen, native inputs — moet met
 * werkhandschoenen te bedienen zijn. Teksten uit `t` (taal per arbeider).
 * Het naamveld ("Wie") is voor ploegbazen die voor hun jongens invullen.
 */
export function WorkerHoursForm({
  token,
  today,
  t,
}: {
  token: string;
  today: string;
  t: PortalStrings;
}) {
  const [state, formAction, pending] = useActionState<LogHoursState, FormData>(
    logHours.bind(null, token),
    null,
  );
  const hoursRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-600">{t.date}</span>
        <input
          type="date"
          name="date"
          required
          defaultValue={today}
          max={today}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 focus:border-stone-500 focus:outline-none"
        />
      </label>

      <div>
        <span className="mb-1 block text-sm font-medium text-stone-600">{t.hours}</span>
        <div className="flex gap-2">
          {QUICK_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                if (hoursRef.current) hoursRef.current.value = h;
              }}
              className="min-w-12 rounded-xl border border-stone-300 bg-white px-3 py-3 text-base font-semibold text-stone-700 active:bg-stone-100"
            >
              {h}
            </button>
          ))}
          <input
            ref={hoursRef}
            name="hours"
            required
            inputMode="decimal"
            placeholder="8"
            className="w-full min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 focus:border-stone-500 focus:outline-none"
          />
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-600">
          {t.crewName} <span className="font-normal text-stone-400">{t.optional}</span>
        </span>
        <input
          name="crewName"
          maxLength={80}
          placeholder={t.crewNamePlaceholder}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 focus:border-stone-500 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-stone-600">
          {t.note} <span className="font-normal text-stone-400">{t.optional}</span>
        </span>
        <input
          name="note"
          maxLength={500}
          placeholder={t.notePlaceholder}
          className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-800 focus:border-stone-500 focus:outline-none"
        />
      </label>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state?.ok && !pending && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">✓ {state.ok}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-stone-800 px-4 py-4 text-base font-semibold text-white active:bg-stone-700 disabled:opacity-60"
      >
        {pending ? t.saving : t.save}
      </button>
    </form>
  );
}
