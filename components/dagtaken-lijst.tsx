/**
 * Weergave van de dagtaken (automatische actiesignalen) — gedeeld door het
 * dashboard en de startpagina. De data komt uit lib/dagtaken.ts.
 */
import Link from "next/link";

import type { Dagtaak, DagtaakTone } from "@/lib/dagtaken";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { tekst } from "@/lib/i18n/server";

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
export async function DagtakenLijst({
  taken,
  titel,
  className = "mb-6",
}: {
  taken: Dagtaak[];
  titel?: string;
  className?: string;
}) {
  const t = await tekst();
  if (taken.length === 0) {
    return (
      <div className={`rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm font-medium text-success ${className}`}>
        ✓ {t("Niets dringends — alles is bij.")}
      </div>
    );
  }
  return (
    <Card className={`border-accent/30 ${className}`}>
      <CardHeader>
        <CardTitle>{titel ?? t("Wat moet er gebeuren")}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/70">
        {taken.map((t) => (
          <DagtaakRow key={t.key} taak={t} />
        ))}
      </CardContent>
    </Card>
  );
}
