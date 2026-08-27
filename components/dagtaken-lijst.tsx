/**
 * Weergave van de dagtaken (automatische actiesignalen) — gedeeld door het
 * dashboard en de startpagina. De data komt uit lib/dagtaken.ts.
 */
import Link from "next/link";

import type { Dagtaak, DagtaakTone } from "@/lib/dagtaken";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";

const TONE_TEXT: Record<DagtaakTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  accent: "text-accent",
};

/** Eén regel in het "Wat moet er gebeuren"-paneel. */
export function DagtaakRow({ taak }: { taak: Dagtaak }) {
  return (
    <Link
      href={taak.href}
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 text-sm text-foreground transition-colors hover:bg-background"
    >
      <span className="text-base leading-none">{taak.emoji}</span>
      <span className="flex-1">
        <strong>{taak.aantal}</strong> {taak.tekst}
      </span>
      <span className={`shrink-0 font-medium ${TONE_TEXT[taak.tone]}`}>→</span>
    </Link>
  );
}

/** De volledige kaart, incl. de "alles is bij"-variant bij een lege lijst. */
export function DagtakenLijst({ taken, titel = "Wat moet er gebeuren" }: { taken: Dagtaak[]; titel?: string }) {
  if (taken.length === 0) {
    return (
      <div className="mb-6 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm font-medium text-success">
        ✓ Niets dringends — alles is bij.
      </div>
    );
  }
  return (
    <Card className="mb-6 border-accent/30">
      <CardHeader>
        <CardTitle>{titel}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/70">
        {taken.map((t) => (
          <DagtaakRow key={t.key} taak={t} />
        ))}
      </CardContent>
    </Card>
  );
}
