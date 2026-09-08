"use client";

/**
 * Mailformulier met AI-concept: de medewerker typt (optioneel) kort wat 'ie
 * wil zeggen, klikt "Schrijf met AI" en krijgt een nette, professionele mail
 * in de taal van de klant — die daarna gewoon te bewerken is. Versturen blijft
 * altijd een aparte, bewuste klik.
 */
import { useState, useTransition } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Input, Textarea } from "@/components/ui";

export function AiMailForm({
  verstuur,
  genereer,
  defaultSubject,
  toEmail,
  placeholder,
  aiBeschikbaar,
}: {
  /** Server action die de mail verstuurt (leest `subject` + `message`). */
  verstuur: (formData: FormData) => Promise<void>;
  /** Server action die een AI-concept teruggeeft; de aanwijzing = wat er nu in het tekstvak staat. */
  genereer: (instructie: string) => Promise<{ subject: string; body: string } | null>;
  defaultSubject: string;
  toEmail: string;
  placeholder?: string;
  aiBeschikbaar: boolean;
}) {
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [fout, setFout] = useState(false);
  const [bezig, startTransition] = useTransition();

  function schrijfMetAi() {
    setFout(false);
    startTransition(async () => {
      const concept = await genereer(message.trim());
      if (!concept) {
        setFout(true);
        return;
      }
      setSubject(concept.subject);
      setMessage(concept.body);
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
          <button
            type="button"
            onClick={schrijfMetAi}
            disabled={bezig}
            className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
          >
            {bezig ? "AI schrijft…" : "✨ Schrijf met AI"}
          </button>
          {fout && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              AI-concept lukte even niet — probeer opnieuw of schrijf zelf.
            </p>
          )}
          <p className="text-xs text-muted">
            Tip: typ eerst in het kort wat je wilt zeggen (of laat leeg) en klik ✨ — de AI maakt er
            een nette mail van in de taal van de klant. Je kunt alles nog aanpassen vóór het versturen.
          </p>
        </>
      )}
      <SubmitButton variant="secondary" className="w-full" pendingLabel="Versturen…">
        Versturen naar {toEmail}
      </SubmitButton>
    </form>
  );
}
