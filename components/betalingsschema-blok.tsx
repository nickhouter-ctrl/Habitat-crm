"use client";

/**
 * Betalingsschema in de offerte-wizard: eerst het aantal termijnen, dan per
 * termijn een omschrijving en een percentage. De standaardtermijnen volgen de
 * bouwfases (opdracht → afbouw → levering → oplevering); meer of minder kan
 * altijd en de omschrijvingen zijn vrij aan te passen.
 */
import { useState } from "react";

import { Input } from "@/components/ui";

export const MAX_TERMIJNEN = 10;

export function BetalingsschemaBlok({
  defaults,
  standaard,
}: {
  defaults: Record<string, string | undefined>;
  /** Standaardtermijnen in de gekozen offertetaal: [{ label, pct }]. */
  standaard: { label: string; pct: number }[];
}) {
  const [aantal, setAantal] = useState(() => {
    const uitParam = Number.parseInt(defaults.s_aantal ?? "", 10);
    if (Number.isFinite(uitParam)) return Math.min(Math.max(uitParam, 0), MAX_TERMIJNEN);
    return standaard.length;
  });

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        Betalingsschema <span className="normal-case tracking-normal">— komt met de bedragen op de offerte; 0% of lege omschrijving = termijn vervalt</span>
      </p>
      <label className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-muted">Aantal termijnen</span>
        <Input
          name="s_aantal"
          inputMode="numeric"
          value={aantal === 0 ? "" : String(aantal)}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            setAantal(Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_TERMIJNEN) : 0);
          }}
          placeholder="—"
          className="w-20 text-right"
        />
      </label>
      {aantal > 0 && (
        <div className="space-y-1.5">
          {Array.from({ length: aantal }, (_, idx) => idx + 1).map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-muted">Termijn {i}</span>
              <Input
                name={`s${i}_label`}
                defaultValue={(defaults[`s${i}_label`] ?? "").trim() || standaard[i - 1]?.label || ""}
                placeholder="omschrijving, bv. bij start dakwerk…"
                className="flex-1"
              />
              {(() => {
                // Alleen een écht overgetypt percentage blijft staan; anders
                // volgt het veld de (automatisch berekende) standaard.
                const vers = standaard[i - 1] ? String(standaard[i - 1].pct) : "";
                const getypt = defaults[`s${i}_pct`];
                const basis = defaults[`s${i}_basis`];
                const waarde = getypt != null && getypt !== "" && getypt !== basis ? getypt : vers;
                return (
                  <>
                    <Input name={`s${i}_pct`} inputMode="decimal" defaultValue={waarde} placeholder="%" className="w-20 text-right" />
                    <input type="hidden" name={`s${i}_basis`} value={vers} />
                  </>
                );
              })()}
              <span className="text-xs text-muted">%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
