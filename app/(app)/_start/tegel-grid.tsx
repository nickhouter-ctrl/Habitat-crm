"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pin, PinOff, SlidersHorizontal } from "lucide-react";

import {
  applyStartPrefs,
  normalizeStartPrefs,
  START_GROEPEN,
  type StartPrefs,
  type StartTegel,
} from "@/lib/start-tegels";
import { Button, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** Eén grote knop. */
function Tegel({ tegel, badge, dimmed = false }: { tegel: StartTegel; badge?: number; dimmed?: boolean }) {
  const Icon = tegel.icon;
  return (
    <Link
      href={tegel.href}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md",
        dimmed && "opacity-40",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{tegel.label}</span>
        <span className="block truncate text-xs text-muted">{tegel.desc}</span>
      </span>
      {(badge ?? 0) > 0 && (
        <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
          {badge! > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function TegelGrid({
  prefs: initialPrefs,
  badges = {},
  saveAction,
}: {
  prefs: StartPrefs | null;
  /** Per href een teller (zelfde bron als de zijbalk-badges). */
  badges?: Record<string, number>;
  saveAction: (prefs: StartPrefs | null) => Promise<void>;
}) {
  const [prefs, setPrefs] = useState<StartPrefs>(() => normalizeStartPrefs(initialPrefs));
  const [bewerken, setBewerken] = useState(false);
  const [pending, start] = useTransition();

  const view = useMemo(() => applyStartPrefs(prefs), [prefs]);

  const move = (key: string, richting: -1 | 1) => {
    const orde = view.volgorde.map((x) => x.key);
    const i = orde.indexOf(key);
    const j = i + richting;
    if (i < 0 || j < 0 || j >= orde.length) return;
    [orde[i], orde[j]] = [orde[j], orde[i]];
    setPrefs((p) => ({ ...p, order: orde }));
  };
  const toggle = (veld: "pinned" | "hidden", key: string) =>
    setPrefs((p) => {
      const huidige = p[veld] ?? [];
      return {
        ...p,
        [veld]: huidige.includes(key) ? huidige.filter((k) => k !== key) : [...huidige, key],
      };
    });

  const opslaan = () => start(async () => { await saveAction(prefs); setBewerken(false); });
  const herstel = () =>
    start(async () => { await saveAction(null); setPrefs(normalizeStartPrefs(null)); setBewerken(false); });

  if (bewerken) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Indeling aanpassen</h2>
          <span className="text-xs text-muted">pin ⭢ bovenaan · oog ⭢ verbergen · pijltjes ⭢ volgorde</span>
          <span className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={herstel} disabled={pending}>
              Standaard herstellen
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setPrefs(normalizeStartPrefs(initialPrefs)); setBewerken(false); }}>
              Annuleren
            </Button>
            <Button size="sm" onClick={opslaan} disabled={pending}>
              {pending ? "Opslaan…" : "Opslaan"}
            </Button>
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {view.volgorde.map((tegel) => {
            const Icon = tegel.icon;
            const isPinned = (prefs.pinned ?? []).includes(tegel.key);
            const isHidden = view.hidden.has(tegel.key);
            return (
              <div
                key={tegel.key}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-surface p-3",
                  isHidden && "opacity-40",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{tegel.label}</span>
                  <span className="block truncate text-[11px] text-muted">{tegel.groep}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => toggle("pinned", tegel.key)} title={isPinned ? "Losmaken" : "Vastpinnen"} className={cn("rounded-md p-1.5 hover:bg-background", isPinned ? "text-accent" : "text-muted")}>
                    {isPinned ? <Pin className="size-4" /> : <PinOff className="size-4" />}
                  </button>
                  <button type="button" onClick={() => toggle("hidden", tegel.key)} title={isHidden ? "Tonen" : "Verbergen"} className="rounded-md p-1.5 text-muted hover:bg-background">
                    {isHidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                  <button type="button" onClick={() => move(tegel.key, -1)} title="Omhoog" className="rounded-md p-1.5 text-muted hover:bg-background">
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" onClick={() => move(tegel.key, 1)} title="Omlaag" className="rounded-md p-1.5 text-muted hover:bg-background">
                    <ArrowDown className="size-4" />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view.pinned.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">📌 Vastgepind</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {view.pinned.map((tegel) => (
              <Tegel key={tegel.key} tegel={tegel} badge={badges[tegel.href]} />
            ))}
          </div>
        </section>
      )}

      {START_GROEPEN.map((groep) => {
        const tegels = view.zichtbaar.filter((x) => x.groep === groep);
        if (tegels.length === 0) return null;
        return (
          <section key={groep}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{groep}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {tegels.map((tegel) => (
                <Tegel key={tegel.key} tegel={tegel} badge={badges[tegel.href]} />
              ))}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => setBewerken(true)}
        className={cn(buttonClass({ variant: "ghost", size: "sm" }), "text-muted")}
      >
        <SlidersHorizontal className="size-4" /> Indeling aanpassen
      </button>
    </div>
  );
}
