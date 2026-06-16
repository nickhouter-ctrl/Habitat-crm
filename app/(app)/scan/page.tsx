"use client";

import { PackageCheck, ScanLine, ScanSearch } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/ui";
import { DeliverPicking } from "./_deliver";
import { ProductLookup } from "./_info";
import { QuickAdjust } from "./_quick";

type Mode = "info" | "quick" | "deliver";

const MODES: { id: Mode; label: string; desc: string; icon: typeof ScanLine }[] = [
  { id: "info", label: "Opzoeken", desc: "Scan voor prijs, maten en voorraad", icon: ScanSearch },
  { id: "deliver", label: "Uitleveren", desc: "Scan een pakbon af en markeer afgeleverd", icon: PackageCheck },
  { id: "quick", label: "Snel bijwerken", desc: "Scan los en boek voorraad erbij/eraf of zet de stand", icon: ScanLine },
];

export default function ScanPage() {
  const [mode, setMode] = useState<Mode | null>(null);

  const active = MODES.find((m) => m.id === mode);

  return (
    <>
      <PageHeader
        title={active ? active.label : "Scannen"}
        subtitle={active ? active.desc : "Kies wat je wilt scannen"}
        actions={
          active ? (
            <button
              type="button"
              onClick={() => setMode(null)}
              className="text-sm text-muted hover:underline"
            >
              ← Andere modus
            </button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-md">
        {!mode && (
          <div className="space-y-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className="flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:bg-background"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                  <m.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-sm text-muted">{m.desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {mode === "info" && <ProductLookup />}
        {mode === "quick" && <QuickAdjust />}
        {mode === "deliver" && <DeliverPicking />}
      </div>
    </>
  );
}
