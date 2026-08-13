"use client";

/**
 * Clientonderdelen van het concurrentendashboard: het toevoegformulier
 * (met NL-validatiefouten uit de server action) en de handmatige sync-knop.
 */
import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { addCompetitor } from "@/app/(app)/marketing/competitors/actions";

const SEGMENT_LABELS: Record<string, string> = {
  materials: "Materialen",
  contractor: "Aannemer",
  architect: "Architect",
  estate_agent: "Makelaar",
};

/** Formulier om een concurrent te volgen (Meta Page-ID uit de Ad Library-URL). */
export function AddCompetitorForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 size-4" aria-hidden />
        Concurrent volgen
      </Button>
    );
  }

  return (
    <form
      className="grid w-full gap-3 rounded-lg border border-border bg-surface/50 p-4 sm:grid-cols-2"
      action={(formData) => {
        startTransition(async () => {
          const result = await addCompetitor(formData);
          setError(result);
          if (!result) {
            setOpen(false);
          }
        });
      }}
    >
      <Field label="Naam" htmlFor="comp-name">
        <Input id="comp-name" name="name" required maxLength={120} placeholder="Bijv. Piedras Levante" />
      </Field>
      <Field
        label="Meta Page-ID"
        htmlFor="comp-page-id"
        hint="Uit de Ad Library-URL: parameter view_all_page_id"
      >
        <Input
          id="comp-page-id"
          name="metaPageId"
          required
          inputMode="numeric"
          pattern="\d{3,20}"
          placeholder="Bijv. 103265471234567"
        />
      </Field>
      <Field label="Website (optioneel)" htmlFor="comp-website">
        <Input id="comp-website" name="website" type="url" placeholder="https://…" />
      </Field>
      <Field label="Segment" htmlFor="comp-segment">
        <Select id="comp-segment" name="segment" defaultValue="">
          <option value="">— Kies segment —</option>
          {Object.entries(SEGMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notities (optioneel)" htmlFor="comp-notes" className="sm:col-span-2">
        <Textarea id="comp-notes" name="notes" rows={2} maxLength={2000} />
      </Field>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Bezig met opslaan…" : "Volgen"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Annuleren
        </Button>
        <p aria-live="polite" className="text-xs text-danger">
          {error}
        </p>
      </div>
    </form>
  );
}

/** Handmatige trigger van de wekelijkse pull, met zichtbare uitkomst. */
export function CompetitorSyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/competitors/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        newAds?: number;
        updatedAds?: number;
        errors?: string[];
        error?: string;
        tokenWarning?: string | null;
      };
      if (body.error) {
        setMessage(body.error);
      } else {
        const parts = [`${body.newAds ?? 0} nieuw`, `${body.updatedAds ?? 0} bijgewerkt`];
        const failures = body.errors ?? [];
        setMessage(
          `Klaar: ${parts.join(", ")}.` +
            (failures.length > 0 ? ` ${failures.length} concurrent(en) mislukt: ${failures[0]}` : ""),
        );
      }
      router.refresh();
    } catch {
      setMessage("Netwerkfout bij het synchroniseren — probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={sync}>
        <RefreshCw className={busy ? "mr-1.5 size-4 animate-spin" : "mr-1.5 size-4"} aria-hidden />
        {busy ? "Archief wordt opgehaald…" : "Nu synchroniseren"}
      </Button>
      <span aria-live="polite" className="text-xs text-muted">
        {message}
      </span>
    </span>
  );
}
