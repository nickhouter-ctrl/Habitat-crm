"use client";

/**
 * Mailformulier met AI-concept: de medewerker typt (optioneel) kort wat 'ie
 * wil zeggen, klikt "Schrijf met AI" en krijgt een nette, professionele mail
 * in de taal van de klant — die daarna gewoon te bewerken is. Vraagt de
 * aanwijzing om een brochure, dan vinkt de AI die ook meteen aan als bijlage
 * (uit de /catalogi-bibliotheek). Versturen blijft altijd een aparte,
 * bewuste klik — en je ziet vóór het versturen exact welke bijlagen meegaan.
 */
import { useState, useTransition } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Input, Textarea } from "@/components/ui";

export interface MailBijlageOptie {
  /** Pad in de catalogi-bucket (tevens bestandsnaam). */
  path: string;
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

export function AiMailForm({
  verstuur,
  genereer,
  defaultSubject,
  toEmail,
  placeholder,
  aiBeschikbaar,
  bijlagen = [],
  suggestie,
}: {
  /** Server action die de mail verstuurt (leest `subject`, `message` en `bijlage[]`). */
  verstuur: (formData: FormData) => Promise<void>;
  /** Server action die een AI-concept teruggeeft; de aanwijzing = wat er nu in het tekstvak staat. */
  genereer: (
    instructie: string,
  ) => Promise<{ subject: string; body: string; bijlagen: string[] } | null>;
  defaultSubject: string;
  toEmail: string;
  placeholder?: string;
  aiBeschikbaar: boolean;
  /** Beschikbare brochures/catalogi die als bijlage mee kunnen. */
  bijlagen?: MailBijlageOptie[];
  /** Extra AI-knop met een vaste aanwijzing (bv. een opvolg-herinnering):
   *  { label: "✨ Schrijf herinnering", instructie: "..." }. */
  suggestie?: { label: string; instructie: string };
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [fout, setFout] = useState(false);
  const [bezig, startTransition] = useTransition();

  const totaalBytes = bijlagen
    .filter((b) => gekozen.has(b.path))
    .reduce((sum, b) => sum + b.size, 0);
  const teGroot = totaalBytes > 20 * 1024 * 1024;

  function toggle(path: string) {
    setGekozen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function schrijfMetAi(instructie?: string) {
    setFout(false);
    startTransition(async () => {
      const concept = await genereer(instructie ?? message.trim());
      if (!concept) {
        setFout(true);
        return;
      }
      setSubject(concept.subject);
      setMessage(concept.body);
      if (concept.bijlagen.length > 0) setGekozen(new Set(concept.bijlagen));
    });
  }

  return (
    <form action={verstuur} className="space-y-2">
      <Input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <Textarea
        name="message"
        rows={message ? 12 : 4}
        required
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder ?? "Bijv. een extra vraag aan de klant…"}
      />
      {aiBeschikbaar && (
        <>
          <div className={suggestie ? "grid grid-cols-2 gap-2" : ""}>
            <button
              type="button"
              onClick={() => schrijfMetAi()}
              disabled={bezig}
              className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
            >
              {bezig ? "AI schrijft…" : "✨ Schrijf met AI"}
            </button>
            {suggestie && (
              <button
                type="button"
                onClick={() => schrijfMetAi(suggestie.instructie)}
                disabled={bezig}
                className="w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-60"
              >
                {bezig ? "AI schrijft…" : suggestie.label}
              </button>
            )}
          </div>
          {fout && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              AI-concept lukte even niet — probeer opnieuw of schrijf zelf.
            </p>
          )}
          <p className="text-xs text-muted">
            Tip: typ eerst in het kort wat je wilt zeggen (of laat leeg) en klik ✨ — de AI maakt er
            een nette mail van in de taal van de klant. Vraag je om een brochure mee te sturen, dan
            vinkt de AI die hieronder aan. Je kunt alles nog aanpassen vóór het versturen.
          </p>
        </>
      )}
      {bijlagen.length > 0 && (
        <details className="rounded-md border border-border" open={gekozen.size > 0}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover:text-foreground">
            📎 Bijlagen uit catalogi{gekozen.size > 0 ? ` (${gekozen.size} gekozen · ${formatSize(totaalBytes)})` : ""}
          </summary>
          <div className="max-h-52 space-y-1 overflow-y-auto px-3 pb-2">
            {bijlagen.map((b) => (
              <label
                key={b.path}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-background-soft"
              >
                <input
                  type="checkbox"
                  checked={gekozen.has(b.path)}
                  onChange={() => toggle(b.path)}
                  className="accent-[var(--accent,#b4552d)]"
                />
                <span className="min-w-0 flex-1 truncate" title={b.name}>
                  {b.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{formatSize(b.size)}</span>
              </label>
            ))}
          </div>
        </details>
      )}
      {teGroot && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          Bijlagen samen groter dan 20 MB — dat past niet in één mail. Kies er minder.
        </p>
      )}
      {[...gekozen].map((path) => (
        <input key={path} type="hidden" name="bijlage" value={path} />
      ))}
      {/* Conditionele spread: een expliciete `disabled` zou anders de eigen
          pending-disable van SubmitButton overschrijven. */}
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Versturen…" {...(teGroot ? { disabled: true } : {})}>
        Versturen naar {toEmail}
        {gekozen.size > 0 ? ` (+${gekozen.size} bijlage${gekozen.size === 1 ? "" : "n"})` : ""}
      </SubmitButton>
    </form>
  );
}
