"use client";
import { useActionState } from "react";
import { useT } from "@/components/taal-provider";
import { createReturnFeeInvoice } from "./return-fee-actions";
export function ReturnFeeForm({invoiceId,version,amount,subtotal}:{invoiceId:string;version:string;amount:string;subtotal:string}) {
  const t=useT();
  const [state,action,pending]=useActionState(createReturnFeeInvoice,null);
  return <form action={action} className="space-y-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
    <input type="hidden" name="invoiceId" value={invoiceId}/><input type="hidden" name="version" value={version}/>
    <p className="text-sm font-medium">{t("Alle goederen retour; vergoeding over")}</p>
    <p className="text-sm">{subtotal} {t("excl. btw")} · {amount} {t("incl. btw")}</p>
    <p className="text-xs leading-relaxed text-muted">{t("Maakt de conceptcreditnota volledig en zet alleen de vergoeding op een aparte eindfactuur. Beide blijven concept. De eindfactuur boekt geen producten af.")}</p>
    <button disabled={pending} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{pending?t("Bezig…"):t("Eindfactuur voor vergoeding")}</button>
    {state?.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
  </form>;
}
