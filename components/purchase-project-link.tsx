"use client";

/**
 * Inkoopfactuur aan een werf hangen — in twee stappen: welk project, en telt het
 * als materiaal of als uren.
 *
 * Stond eerder als twee losse formulieren in de smalle zijkolom, met twee
 * zoekvelden onder elkaar (allebei "Zoek een project…"), twee knoppen die om
 * voorrang streden en een uitleg van vier regels eronder. Je moest de tekst
 * lezen om te weten welke knop je nodig had. Nu kies je eerst het project, dan
 * één van twee kaarten, en pas dán zie je de velden die daarbij horen.
 */
import { useState } from "react";
import { Clock, Package } from "lucide-react";

import { Combobox } from "@/components/combobox";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Input } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ProjectOption = { id: string; name: string };

export function PurchaseProjectLink({
  projects,
  current,
  suggestion,
  linkAsMaterial,
  linkAsHours,
}: {
  projects: ProjectOption[];
  current: { projectId: string | null; projectName: string | null; countAsLabor: boolean; hours: number | null };
  /** Voorstel van de AI bij binnenkomst; alleen getoond zolang er niets gekoppeld is. */
  suggestion: { projectId: string | null; projectName: string | null; kind: "labor" | "material" | null; hours: number | null } | null;
  linkAsMaterial: (formData: FormData) => void | Promise<void>;
  linkAsHours: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<"material" | "labor">(current.countAsLabor ? "labor" : "material");
  const [wijzigen, setWijzigen] = useState(!current.projectId);
  const opties = projects.map((p) => ({ value: p.id, label: p.name }));

  // Gekoppeld en niet aan het wijzigen: alleen tonen wat er staat.
  if (current.projectId && !wijzigen) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{current.projectName ?? "Onbekend project"}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <Badge tone={current.countAsLabor ? "accent" : "neutral"}>
              {current.countAsLabor ? "telt als uren / arbeid" : "telt als materiaalkost"}
            </Badge>
            {current.countAsLabor && current.hours ? <span>{current.hours} uur geboekt</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWijzigen(true)}
            className="rounded-md border bg-surface px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-background"
          >
            Wijzigen
          </button>
          <form action={linkAsMaterial}>
            <input type="hidden" name="projectId" value="" />
            <SubmitButton size="sm" variant="ghost" pendingLabel="…">
              Ontkoppelen
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Voorstel van de AI: als het klopt is het één klik. */}
      {!current.projectId && suggestion?.projectId && suggestion.kind && (
        <form
          action={suggestion.kind === "labor" ? linkAsHours : linkAsMaterial}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3"
        >
          <p className="text-sm">
            Gelezen op de factuur: <strong>{suggestion.kind === "labor" ? "uren / arbeid" : "materiaal"}</strong>
            {suggestion.hours ? ` (${suggestion.hours} uur)` : ""} voor <strong>{suggestion.projectName}</strong>.
          </p>
          <input type="hidden" name="projectId" value={suggestion.projectId} />
          {suggestion.kind === "labor" && <input type="hidden" name="hours" value={suggestion.hours ?? ""} />}
          <SubmitButton size="sm" variant="primary" pendingLabel="…">
            Klopt, koppelen
          </SubmitButton>
        </form>
      )}

      <form action={kind === "labor" ? linkAsHours : linkAsMaterial} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">1 · Welk project?</label>
          <Combobox
            name="projectId"
            defaultValue={current.projectId ?? suggestion?.projectId ?? ""}
            clearable
            placeholder="Zoek een werf…"
            options={opties}
            menuClassName="w-full"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium">2 · Hoe telt deze factuur mee?</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <Keuze
              actief={kind === "material"}
              onClick={() => setKind("material")}
              icoon={<Package className="size-5" />}
              titel="Materiaal"
              uitleg="Telt als inkoopkost op het project."
            />
            <Keuze
              actief={kind === "labor"}
              onClick={() => setKind("labor")}
              icoon={<Clock className="size-5" />}
              titel="Uren / arbeid"
              uitleg="Maakt een arbeidsregel; telt niet óók als materiaal."
            />
          </div>
        </div>

        {kind === "labor" && (
          <div className="space-y-3 rounded-lg border bg-background/50 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <label className="mb-1.5 block text-sm font-medium" htmlFor="po-hours">
                  Aantal uren
                </label>
                <Input
                  id="po-hours"
                  name="hours"
                  type="number"
                  step="0.5"
                  min="0"
                  className="text-right"
                  defaultValue={current.hours ?? suggestion?.hours ?? ""}
                  placeholder="bijv. 94,5"
                />
              </div>
              <p className="flex-1 text-xs text-muted">
                Het uurtarief volgt uit bedrag ÷ uren. Laat je dit leeg, dan komt het hele bedrag als één post op het
                project te staan.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="alreadyLogged" className="mt-0.5 size-4" />
              <span>
                De uren staan al op het project
                <span className="block text-xs text-muted">
                  bijvoorbeeld via het urenportaal ingevuld — dan alleen koppelen, geen tweede urenregel maken
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="primary" pendingLabel="Koppelen…">
            {kind === "labor" ? "Koppelen als uren" : "Koppelen als materiaal"}
          </SubmitButton>
          {current.projectId && (
            <button
              type="button"
              onClick={() => setWijzigen(false)}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              Annuleren
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Keuze({
  actief,
  onClick,
  icoon,
  titel,
  uitleg,
}: {
  actief: boolean;
  onClick: () => void;
  icoon: React.ReactNode;
  titel: string;
  uitleg: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actief}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
        actief ? "border-accent bg-accent/5 shadow-sm ring-1 ring-accent/30" : "bg-surface hover:bg-background",
      )}
    >
      <span className={cn("mt-0.5", actief ? "text-accent" : "text-muted")}>{icoon}</span>
      <span>
        <span className="block font-medium">{titel}</span>
        <span className="block text-xs text-muted">{uitleg}</span>
      </span>
    </button>
  );
}
