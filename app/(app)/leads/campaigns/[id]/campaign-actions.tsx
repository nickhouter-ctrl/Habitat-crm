"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui";
import { sendCampaign, sendTestEmail } from "../../actions";

/** Testmail + verzenden met expliciete JA-bevestiging (net als de factuurrun). */
export function CampaignActions({ campaignId, recipientCount }: { campaignId: string; recipientCount: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
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
          disabled={pending || recipientCount === 0}
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
      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
      )}
    </div>
  );
}
