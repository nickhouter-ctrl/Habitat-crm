"use client";

/**
 * Badkamer-blokken in de offerte-wizard: eerst het aantal invullen, dan
 * verschijnt er per badkamer een eigen blok (m² vloer + wat erin komt).
 * Het aantal stuurt direct hoeveel blokken er staan — meer of minder kan
 * altijd; ingevulde waarden van blokken die blijven staan gaan niet verloren.
 */
import { useState } from "react";

import { Input } from "@/components/ui";

const VELDEN = [
  { veld: "m2", label: "m² vloer" },
  { veld: "douches", label: "douches" },
  { veld: "baden", label: "baden" },
  { veld: "wastafels", label: "wastafels" },
  { veld: "toiletten", label: "toiletten" },
] as const;

export const MAX_BADKAMERS = 12;

export function BadkamerBlokken({ defaults }: { defaults: Record<string, string | undefined> }) {
  const [aantal, setAantal] = useState(() => {
    const uitParam = Number.parseInt(defaults.b_aantal ?? "", 10);
    if (Number.isFinite(uitParam)) return Math.min(Math.max(uitParam, 0), MAX_BADKAMERS);
    // Geen aantal in de URL: zoveel blokken als er eerder zijn ingevuld.
    let hoogste = 0;
    for (let i = 1; i <= MAX_BADKAMERS; i++) {
      if (VELDEN.some(({ veld }) => (defaults[`b${i}_${veld}`] ?? "") !== "")) hoogste = i;
    }
    return hoogste;
  });

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        Badkamers &amp; sanitair <span className="normal-case tracking-normal">— per badkamer: m² en wat erin komt</span>
      </p>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <span className="text-muted">Aantal badkamers</span>
        <Input
          name="b_aantal"
          inputMode="numeric"
          value={aantal === 0 ? "" : String(aantal)}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            setAantal(Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_BADKAMERS) : 0);
          }}
          placeholder="—"
          className="w-20 text-right"
        />
      </label>
      {aantal > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: aantal }, (_, idx) => idx + 1).map((i) => (
            <div key={i} className="rounded-md border p-2.5">
              <p className="mb-1.5 text-xs font-semibold">Badkamer {i}</p>
              <div className="grid grid-cols-5 gap-1.5">
                {VELDEN.map(({ veld, label }) => (
                  <label key={veld} className="text-center text-[10px] text-muted">
                    <Input
                      name={`b${i}_${veld}`}
                      inputMode="decimal"
                      defaultValue={defaults[`b${i}_${veld}`] ?? ""}
                      placeholder="—"
                      className="px-1 text-center"
                    />
                    <span className="mt-0.5 block">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
