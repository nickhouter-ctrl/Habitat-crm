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

const SLEUTELS = ["geen-antwoord", "terugbellen", "interesse", "afspraak", "geen-interesse", "verkeerd-nummer"] as const;

export type BelLabels = {
  uitkomst: string;
  notitie: string;
  opslaan: string;
  inplannen: string;
  datumTijd: string;
  duur: string;
  plaats: string;
  plaatsVoorstel: string;
  agendaHint: string;
  contactOpenen: string;
  nogEenPoging: string;
  duren: Record<string, string>;
  uitkomsten: Record<string, string>;
};

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
  labels,
}: {
  prospectId: string;
  bedrijf: string;
  action: (formData: FormData) => Promise<BelResultaat>;
  labels: BelLabels;
}) {
  const [bezig, start] = useTransition();
  const [uitkomst, setUitkomst] = useState("");
  const [note, setNote] = useState("");
  const [wanneer, setWanneer] = useState(morgenTien);
  const [duur, setDuur] = useState("60");
  const [plaats, setPlaats] = useState(labels.plaatsVoorstel);
  const [klaar, setKlaar] = useState<BelResultaat | null>(null);
  const afspraak = uitkomst === "afspraak";

  if (klaar?.ok) {
    return (
      <div className="text-xs">
        <span className="text-success">{klaar.melding}</span>
        {klaar.contactId && (
          <Link href={`/contacts/${klaar.contactId}`} className="ml-2 text-accent hover:underline">
            {labels.contactOpenen}
          </Link>
        )}
        <button type="button" onClick={() => setKlaar(null)} className="ml-2 text-muted underline">
          {labels.nogEenPoging}
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
          <option value="">{labels.uitkomst}</option>
          {SLEUTELS.map((v) => (
            <option key={v} value={v}>
              {labels.uitkomsten[v] ?? v}
            </option>
          ))}
        </Select>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={labels.notitie}
          className="h-8 w-40 text-sm"
          aria-label={labels.notitie}
        />
        <Button type="submit" size="sm" variant={afspraak ? "primary" : "secondary"} disabled={!uitkomst || bezig}>
          {bezig ? "…" : afspraak ? labels.inplannen : labels.opslaan}
        </Button>
      </div>

      {afspraak && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 p-2">
          <Input
            type="datetime-local"
            value={wanneer}
            onChange={(e) => setWanneer(e.target.value)}
            className="h-8 w-52 text-sm"
            aria-label={labels.datumTijd}
          />
          <Select value={duur} onChange={(e) => setDuur(e.target.value)} className="h-8 w-28 text-sm" aria-label={labels.duur}>
            {["30", "60", "90", "120"].map((m) => (
              <option key={m} value={m}>
                {labels.duren[m] ?? `${m} min`}
              </option>
            ))}
          </Select>
          <Input
            value={plaats}
            onChange={(e) => setPlaats(e.target.value)}
            placeholder={labels.plaats}
            className="h-8 w-40 text-sm"
            aria-label={labels.plaats}
          />
          <span className="text-xs text-muted">{labels.agendaHint}</span>
        </div>
      )}

      {klaar && !klaar.ok && <p className="text-xs text-danger">{klaar.melding}</p>}
    </form>
  );
}
