"use client";

/**
 * Belresultaat vastleggen, in de rij zelf. Bewust geen dialoog: tijdens bellen
 * wil je kiezen en typen zonder muisreis.
 *
 * Kies je "Afspraak", dan klapt er een datum-, tijd- en plaatsveld uit. Bij
 * opslaan maakt de server het contact aan en zet de afspraak in de agenda; de
 * link naar dat contact verschijnt meteen in de rij.
 */
import { useState, useTransition } from "react";
import Link from "next/link";

import { Button, Input, Select } from "@/components/ui";

import type { BelResultaat } from "./actions";

const UITKOMSTEN: [string, string][] = [
  ["geen-antwoord", "Geen antwoord"],
  ["terugbellen", "Terugbellen"],
  ["interesse", "Interesse"],
  ["afspraak", "Afspraak"],
  ["geen-interesse", "Geen interesse"],
  ["verkeerd-nummer", "Verkeerd nummer"],
];

/** Voorstel: morgen 10:00 in Madrid-tijd, in het formaat van datetime-local. */
function morgenTien(): string {
  const d = new Date(Date.now() + 86_400_000);
  const madrid = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  madrid.setHours(10, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${madrid.getFullYear()}-${p(madrid.getMonth() + 1)}-${p(madrid.getDate())}T${p(madrid.getHours())}:${p(madrid.getMinutes())}`;
}

export function BelFormulier({
  prospectId,
  bedrijf,
  action,
}: {
  prospectId: string;
  bedrijf: string;
  action: (formData: FormData) => Promise<BelResultaat>;
}) {
  const [bezig, start] = useTransition();
  const [uitkomst, setUitkomst] = useState("");
  const [note, setNote] = useState("");
  const [wanneer, setWanneer] = useState(morgenTien);
  const [duur, setDuur] = useState("60");
  const [plaats, setPlaats] = useState("Showroom Jávea");
  const [klaar, setKlaar] = useState<BelResultaat | null>(null);
  const afspraak = uitkomst === "afspraak";

  if (klaar?.ok) {
    return (
      <div className="text-xs">
        <span className="text-success">{klaar.melding}</span>
        {klaar.contactId && (
          <Link href={`/contacts/${klaar.contactId}`} className="ml-2 text-accent hover:underline">
            Contact openen
          </Link>
        )}
        <button type="button" onClick={() => setKlaar(null)} className="ml-2 text-muted underline">
          nog een poging
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!uitkomst) return;
        const fd = new FormData();
        fd.set("prospectId", prospectId);
        fd.set("outcome", uitkomst);
        fd.set("note", note);
        if (afspraak) {
          fd.set("startsAt", wanneer);
          fd.set("duurMin", duur);
          fd.set("location", plaats);
        }
        start(async () => {
          const res = await action(fd);
          setKlaar(res);
          if (res.ok) {
            setUitkomst("");
            setNote("");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={uitkomst}
          onChange={(e) => setUitkomst(e.target.value)}
          className="h-8 w-36 text-sm"
          aria-label={`Uitkomst gesprek ${bedrijf}`}
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
          className="h-8 w-40 text-sm"
          aria-label="Notitie"
        />
        <Button type="submit" size="sm" variant={afspraak ? "primary" : "secondary"} disabled={!uitkomst || bezig}>
          {bezig ? "…" : afspraak ? "Afspraak inplannen" : "Opslaan"}
        </Button>
      </div>

      {afspraak && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 p-2">
          <Input
            type="datetime-local"
            value={wanneer}
            onChange={(e) => setWanneer(e.target.value)}
            className="h-8 w-52 text-sm"
            aria-label="Datum en tijd"
          />
          <Select value={duur} onChange={(e) => setDuur(e.target.value)} className="h-8 w-28 text-sm" aria-label="Duur">
            <option value="30">30 min</option>
            <option value="60">1 uur</option>
            <option value="90">1,5 uur</option>
            <option value="120">2 uur</option>
          </Select>
          <Input
            value={plaats}
            onChange={(e) => setPlaats(e.target.value)}
            placeholder="Plaats"
            className="h-8 w-40 text-sm"
            aria-label="Plaats"
          />
          <span className="text-xs text-muted">komt in de agenda, contact wordt aangemaakt</span>
        </div>
      )}

      {klaar && !klaar.ok && <p className="text-xs text-danger">{klaar.melding}</p>}
    </form>
  );
}
