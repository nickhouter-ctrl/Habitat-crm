"use client";

/**
 * Meta-koppeling voor een campagne of advertentieset zonder meta_id (U5):
 * óf gepauzeerd in Meta zetten (push), óf een bestaand Meta-id koppelen
 * (voor objecten die al in Business Manager bestaan). Fouten verschijnen
 * vertaald en aria-live; succes ververst de servergerenderde pagina.
 */
import { Link2, Send } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

import { Button, Input } from "@/components/ui";
import {
  linkMetaIdAction,
  pushAdSetAction,
  pushCampaignAction,
  type CampaignActionState,
} from "@/app/(app)/marketing/campaigns/actions";

export function MetaPushControls({
  kind,
  localId,
  campaignId,
  pushLabel,
}: {
  kind: "campaign" | "adSet";
  localId: string;
  campaignId: string;
  /** Bijv. "Zet campagne in Meta" / "Zet advertentieset in Meta". */
  pushLabel: string;
}) {
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushing, startPush] = useTransition();
  const [linkState, linkAction, linking] = useActionState<CampaignActionState, FormData>(
    linkMetaIdAction,
    {},
  );
  const [showLink, setShowLink] = useState(false);

  function push() {
    startPush(async () => {
      const result =
        kind === "campaign"
          ? await pushCampaignAction(localId)
          : await pushAdSetAction(localId, campaignId);
      setPushError(result.error ?? null);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pushing || linking} onClick={push}>
          <Send className="mr-1.5 size-3.5" aria-hidden />
          {pushing ? "Bezig met aanmaken…" : `${pushLabel} (gepauzeerd)`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setShowLink((v) => !v)}
          aria-expanded={showLink}
        >
          <Link2 className="mr-1.5 size-3.5" aria-hidden />
          Bestaand Meta-id koppelen
        </Button>
      </div>

      {showLink && (
        <form action={linkAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="localId" value={localId} />
          <input type="hidden" name="campaignId" value={campaignId} />
          <label className="sr-only" htmlFor={`meta-id-${localId}`}>
            Meta-id
          </label>
          <Input
            id={`meta-id-${localId}`}
            name="metaId"
            required
            inputMode="numeric"
            placeholder="Id uit Ads Manager, bv. 120210123456789"
            className="w-64"
          />
          <Button type="submit" size="sm" variant="secondary" disabled={linking}>
            {linking ? "Controleren bij Meta…" : "Koppelen"}
          </Button>
        </form>
      )}

      <p aria-live="polite" className="text-xs text-danger">
        {pushError ?? linkState.error}
      </p>
    </div>
  );
}
