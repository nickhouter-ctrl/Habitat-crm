"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useTransition } from "react";

import { Select } from "@/components/ui";

/**
 * Prijsniveau (particulier ↔ zakelijk) van een klant-account — slaat direct op
 * bij wijzigen (geen aparte opslaan-knop). Roept de server-action aan.
 */
export function AccountTierSelect({
  accountId,
  tier,
  onChangeAction,
}: {
  accountId: string;
  tier: "particulier" | "aannemer";
  onChangeAction: (accountId: string, formData: FormData) => Promise<void>;
}) {
  const uiT = useUiTranslation();
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Select
        defaultValue={tier}
        disabled={pending}
        className="h-8 py-1 text-xs"
        onChange={(e) => {
          const fd = new FormData();
          fd.set("tier", e.currentTarget.value);
          startTransition(() => onChangeAction(accountId, fd));
        }}
      >
        <option value="particulier">{uiT("Particulier")}</option>
        <option value="aannemer">{uiT("Zakelijk (−20%)")}</option>
      </Select>
      {pending && <span className="text-xs text-muted">{uiT("opslaan…")}</span>}
    </span>
  );
}
