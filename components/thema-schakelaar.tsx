"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Licht, donker of meedoen met de computer. De keuze staat in de cookie
 * `crm-thema`; het inline-script in app/layout.tsx leest die vóór de eerste
 * paint, zodat een donkere pagina niet eerst licht opflitst. Hier alleen de
 * knoppen plus het live omschakelen als de computer zelf van modus wisselt.
 */
type Keuze = "systeem" | "licht" | "donker";

const OPTIES: Array<{ keuze: Keuze; label: string; Icoon: typeof Sun }> = [
  { keuze: "systeem", label: "Zoals de computer", Icoon: Monitor },
  { keuze: "licht", label: "Licht", Icoon: Sun },
  { keuze: "donker", label: "Donker", Icoon: Moon },
];

function pasToe(keuze: Keuze) {
  const donker =
    keuze === "donker" ||
    (keuze === "systeem" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.thema = donker ? "donker" : "licht";
  document.documentElement.dataset.themaKeuze = keuze;
}

export function ThemaSchakelaar({ className }: { className?: string }) {
  const [keuze, setKeuze] = useState<Keuze>("systeem");

  useEffect(() => {
    const huidig = document.documentElement.dataset.themaKeuze as Keuze | undefined;
    if (huidig) setKeuze(huidig);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const volg = () => pasToe(keuze);
    mq.addEventListener("change", volg);
    return () => mq.removeEventListener("change", volg);
  }, [keuze]);

  const kies = (k: Keuze) => {
    setKeuze(k);
    document.cookie = `crm-thema=${k}; path=/; max-age=31536000; samesite=lax`;
    pasToe(k);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Weergave"
      className={cn("inline-flex rounded-md border bg-background p-0.5", className)}
    >
      {OPTIES.map(({ keuze: k, label, Icoon }) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={keuze === k}
          title={label}
          onClick={() => kies(k)}
          className={cn(
            "rounded p-1.5 transition-colors",
            keuze === k ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          <Icoon className="size-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
