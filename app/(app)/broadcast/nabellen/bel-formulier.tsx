"use client";

/**
 * Belresultaat vastleggen, één rij per prospect. Bewust geen dialoog: tijdens
 * bellen wil je in dezelfde rij kunnen kiezen en typen, zonder muisreis.
 */
import { useState, useTransition } from "react";

import { Button, Input, Select } from "@/components/ui";

const UITKOMSTEN: [string, string][] = [
  ["geen-antwoord", "Geen antwoord"],
  ["terugbellen", "Terugbellen"],
  ["interesse", "Interesse"],
  ["afspraak", "Afspraak"],
  ["geen-interesse", "Geen interesse"],
  ["verkeerd-nummer", "Verkeerd nummer"],
];

export function BelFormulier({
  prospectId,
  action,
}: {
  prospectId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [bezig, start] = useTransition();
  const [uitkomst, setUitkomst] = useState("");
  const [note, setNote] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!uitkomst) return;
        const fd = new FormData();
        fd.set("prospectId", prospectId);
        fd.set("outcome", uitkomst);
        fd.set("note", note);
        start(async () => {
          await action(fd);
          setUitkomst("");
          setNote("");
        });
      }}
    >
      <Select
        name="outcome"
        value={uitkomst}
        onChange={(e) => setUitkomst(e.target.value)}
        className="h-8 w-36 text-sm"
        aria-label="Uitkomst"
      >
        <option value="">Uitkomst…</option>
        {UITKOMSTEN.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Notitie"
        className="h-8 w-44 text-sm"
        aria-label="Notitie"
      />
      <Button type="submit" size="sm" variant="secondary" disabled={!uitkomst || bezig}>
        {bezig ? "…" : "Opslaan"}
      </Button>
    </form>
  );
}
