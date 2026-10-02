"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

/** Klein formulier om een campagne-record aan te maken (brief §7). */
import { useActionState } from "react";

import { createCampaign, type CampaignActionState } from "@/app/(app)/marketing/campaigns/actions";
import { Card, Field, Input, buttonClass } from "@/components/ui";

export function CampaignForm() {
  const uiT = useUiTranslation();
  const [state, action, pending] = useActionState<CampaignActionState, FormData>(
    createCampaign,
    {},
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label={uiT("Naam")} htmlFor="camp-name" className="min-w-56 flex-1">
        <Input id="camp-name" name="name" required placeholder={uiT("bv. Voorjaar keukenbladen ES")} />
      </Field>
      <Field label={uiT("Doelstelling")} htmlFor="camp-objective">
        <select
          id="camp-objective"
          name="objective"
          defaultValue="OUTCOME_TRAFFIC"
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="OUTCOME_TRAFFIC">{uiT("Verkeer")}</option>
          <option value="OUTCOME_LEADS">{uiT("Leads")}</option>
          <option value="OUTCOME_AWARENESS">{uiT("Bekendheid")}</option>
        </select>
      </Field>
      <button type="submit" disabled={pending} className={buttonClass()}>
        {pending ? uiT("Aanmaken…") : uiT("Campagne aanmaken")}
      </button>
      {state.error && (
        <Card className="w-full border-red-300 bg-red-50 p-3 text-sm" role="alert">
          {uiT(state.error ?? "")}
          {state.errors?.map((e) => <p key={e}>{e}</p>)}
        </Card>
      )}
    </form>
  );
}
