"use client";
import { useActionState } from "react";
import { createApiKey, type KeyState } from "./actions";
import { Field, Input } from "@/components/ui";
export function CreateApiKey() {
  const [state, action, pending] = useActionState(createApiKey, null as KeyState);
  return <div className="space-y-3">
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Naam" htmlFor="api-name"><Input id="api-name" name="name" required maxLength={80} placeholder="Bijv. Instagram-content Mark" /></Field>
      <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" name="write" defaultChecked /> Mag ook uploaden en concepten aanmaken</label>
      <button disabled={pending} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50">{pending ? "Bezig…" : "Sleutel aanmaken"}</button>
    </form>
    {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    {state?.key && <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
      <p className="font-semibold">Kopieer deze sleutel nu — hij wordt maar één keer getoond.</p>
      <code className="block break-all rounded bg-background p-2 font-mono text-xs select-all">{state.key}</code>
      <p className="text-muted">Stuur hem via een veilig kanaal (niet in een groepschat) en samen met de link naar de documentatie hieronder.</p>
    </div>}
  </div>;
}
