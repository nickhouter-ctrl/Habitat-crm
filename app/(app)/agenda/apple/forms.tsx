"use client";

import { useActionState, useState, useTransition } from "react";
import { useT } from "@/components/taal-provider";
import { Field, Input } from "@/components/ui";
import { connectAppleAction, disconnectAppleAction, syncAppleAction, type AppleFormState } from "./actions";

export function AppleConnectForm({ account }: { account?: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(connectAppleAction, {} as AppleFormState);
  return <form action={action} className="space-y-4">
    <fieldset disabled={pending || !!state.success} className="space-y-4 disabled:opacity-60">
      <Field label={t("Apple Account (e-mailadres)")} htmlFor="apple-account"><Input id="apple-account" name="account" type="email" required autoComplete="username" defaultValue={account} readOnly={!!account} maxLength={254}/></Field>
      <Field label={t("App-specifiek wachtwoord")} htmlFor="apple-password"><Input id="apple-password" name="password" type="password" required autoComplete="new-password" placeholder="xxxx-xxxx-xxxx-xxxx" maxLength={19}/></Field>
      <p className="text-sm text-muted">{t("Maak bij Apple een app-specifiek wachtwoord voor Habitat CRM. Gebruik hier niet je gewone Apple-wachtwoord.")} <a href="https://account.apple.com" target="_blank" rel="noopener noreferrer" className="text-accent underline">{t("Open Apple Account")}</a></p>
      <label className="flex items-start gap-3 text-sm"><input name="consent" type="checkbox" required className="mt-1"/>{t("Ik geef toestemming om de CRM-teamafspraken, inclusief locatie en notities, met de aparte iCloud-werkagenda te synchroniseren. Uitgenodigde bewerkers kunnen deze gegevens zien en wijzigen.")}</label>
      <button className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">{t(pending ? "Verbinden…" : "Verbind Apple Agenda")}</button>
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
    {state.success && <p role="status" className="text-sm text-success">{t(state.success)}</p>}
  </form>;
}

export function AppleSyncControls() {
  const t = useT(), [pending, start] = useTransition(), [state, setState] = useState<AppleFormState>({});
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3">
      <button disabled={pending} onClick={() => start(async () => { setState(await syncAppleAction()); })} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{t(pending ? "Bezig…" : "Nu synchroniseren")}</button>
      <button disabled={pending} onClick={() => {
        if (window.confirm(t("Koppeling stoppen? Afspraken blijven in beide agenda’s staan, maar wijzigingen worden niet meer uitgewisseld."))) start(async () => { setState(await disconnectAppleAction()); });
      }} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{t("Koppeling stoppen")}</button>
    </div>
    {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
    {state.success && <p role="status" className="text-sm text-success">{t(state.success)}</p>}
  </div>;
}
