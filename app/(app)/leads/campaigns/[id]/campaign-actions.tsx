"use client";

import { useState, useTransition } from "react";

import { Button, Input } from "@/components/ui";
import { generateCopyForCampaign, sendCampaign, sendTestEmail } from "../../actions";

/** AI-tekst genereren, testmail sturen en verzenden — met expliciete JA-bevestiging. */
export function CampaignActions({
  campaignId,
  recipientCount,
  hasCopy,
  aiAvailable,
}: {
  campaignId: string;
  recipientCount: number;
  hasCopy: boolean;
  aiAvailable: boolean;
}) {
  const [pending, start] = useTransition();
  const [angle, setAngle] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-3">
      {/* AI: onderwerp + tekst opstellen in huisstijl */}
      <div className="space-y-2 rounded-lg border bg-background/50 p-3">
        <p className="text-sm font-medium">Stel op met AI</p>
        <Input
          value={angle}
          onChange={(e) => setAngle(e.target.value)}
          placeholder="Insteek/aanleiding (optioneel), bv. 'nieuwe badkamercollectie'"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !aiAvailable}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await generateCopyForCampaign(campaignId, angle);
              setMsg(r.ok ? { ok: true, text: "Onderwerp & tekst gegenereerd — controleer het voorbeeld." } : { ok: false, text: r.error ?? "mislukt" });
            })
          }
        >
          {pending ? "Bezig…" : hasCopy ? "Opnieuw genereren met AI" : "Genereer met AI"}
        </Button>
        {!aiAvailable && <p className="text-xs text-muted">AI niet beschikbaar — zet ANTHROPIC_API_KEY in de omgeving.</p>}
      </div>

      {/* Testen + verzenden */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !hasCopy}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await sendTestEmail(campaignId);
              setMsg(r.ok ? { ok: true, text: `Testmail verstuurd naar ${r.to}.` } : { ok: false, text: r.error ?? "mislukt" });
            })
          }
        >
          Stuur testmail naar mij
        </Button>

        <Button
          type="button"
          variant="primary"
          disabled={pending || recipientCount === 0 || !hasCopy}
          onClick={() => {
            if (
              !window.confirm(
                `Deze campagne nu versturen naar ${recipientCount} bedrijf(ven)? Dit verstuurt echte e-mails. Klik OK om te bevestigen.`,
              )
            )
              return;
            start(async () => {
              setMsg(null);
              const r = await sendCampaign(campaignId);
              setMsg(
                r.ok
                  ? { ok: true, text: `${r.sent} verstuurd${r.remaining ? `, nog ${r.remaining} te gaan — klik nogmaals` : ""}.` }
                  : { ok: false, text: r.error ?? "mislukt" },
              );
            });
          }}
        >
          {pending ? "Bezig…" : `Verzenden naar ${recipientCount}`}
        </Button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
