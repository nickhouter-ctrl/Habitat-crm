"use client";

import { useState, useTransition } from "react";

import { Button, Input } from "@/components/ui";
import { generateCopyForCampaign, queueCampaign, runSendRoundNow, sendTestEmail } from "../../actions";

/**
 * AI-tekst opstellen, testmail sturen en de campagne in de wachtrij zetten.
 *
 * "Verzenden" betekent hier: in de wachtrij zetten. De cron stuurt daarna in
 * porties, binnen het verzendvenster en onder de dagcap. Dat is het verschil
 * met vroeger, toen één klik 60 mails de deur uit deed en je bij 7.000 adressen
 * 117 keer moest klikken.
 */
export function CampaignActions({
  campaignId,
  recipientCount,
  hasCopy,
  aiAvailable,
  inWachtrij = 0,
  bulkGereed = true,
}: {
  campaignId: string;
  recipientCount: number;
  hasCopy: boolean;
  aiAvailable: boolean;
  /** Hoeveel er nu nog in de wachtrij van deze campagne staan. */
  inWachtrij?: number;
  bulkGereed?: boolean;
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
          disabled={pending || recipientCount === 0 || !hasCopy || !bulkGereed}
          onClick={() => {
            if (
              !window.confirm(
                `${recipientCount} bedrijven in de wachtrij zetten? Er gaat niets in één keer uit: het systeem verstuurt ze verspreid over de dagen, binnen de dagcap.`,
              )
            )
              return;
            start(async () => {
              setMsg(null);
              const r = await queueCampaign(campaignId);
              setMsg(
                r.ok
                  ? { ok: true, text: `${r.totaal} in de wachtrij. Het versturen begint automatisch binnen tien minuten.` }
                  : { ok: false, text: r.error ?? "mislukt" },
              );
            });
          }}
        >
          {pending ? "Bezig…" : inWachtrij > 0 ? `Wachtrij aanvullen (${recipientCount})` : `In de wachtrij zetten (${recipientCount})`}
        </Button>

        {inWachtrij > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const r = await runSendRoundNow(campaignId);
                setMsg({
                  ok: r.ok,
                  text: r.verstuurd > 0
                    ? `${r.verstuurd} verstuurd${r.mislukt ? `, ${r.mislukt} mislukt` : ""}.`
                    : r.reden ?? "Niets te doen.",
                });
              })
            }
          >
            {pending ? "Bezig…" : "Nu een ronde draaien"}
          </Button>
        )}
      </div>

      {!bulkGereed && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          Het verzendkanaal is niet ingesteld (RESEND_API_KEY). Er kan niets verstuurd worden.
        </p>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
