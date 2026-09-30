"use client";
import { useActionState, useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { PRESENTATION_MODES, type PresentationInput } from "@/lib/presentation";
import { savePresentation, bookRedemption, voidRedemption, type Result } from "./actions";
import { formatEUR } from "@/lib/utils";

function Feedback({ state }: { state: Result }) {
  return state.error ? <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{state.error}</p> : state.success ? <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{state.success}</p> : null;
}
const button = "rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50";
export type AgreementFormData = { mode: PresentationInput["mode"]; title: string; value: string; contribution: string; paid: string; cost: string; rate: string; minimumOrder: string; remainder: string; expires: string; terms: string; version: number };
export function AgreementForm({ contactId, initial }: { contactId: string; initial: AgreementFormData }) {
  const [state, action, pending] = useActionState(savePresentation, {});
  const [mode, setMode] = useState(initial.mode);
  const [value, setValue] = useState(initial.value);
  const [contribution, setContribution] = useState(initial.contribution);
  const refundable = mode === "first_order" || mode === "spread";
  const customer = mode === "free" ? 0 : Math.max(0, Number(value) - (mode === "contribution" ? Number(contribution) : 0));
  return <form action={action} className="space-y-5">
    <input type="hidden" name="contactId" value={contactId} />
    <input type="hidden" name="version" value={initial.version} />
    <fieldset disabled={pending} className="space-y-5">
      <legend className="mb-3 font-medium">Kies de afspraak</legend>
      <div className="grid gap-2 sm:grid-cols-2">{Object.entries(PRESENTATION_MODES).map(([key, label]) => <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${mode === key ? "border-accent bg-accent/5" : "bg-surface"}`}>
        <input type="radio" name="mode" value={key} checked={mode === key} onChange={() => setMode(key as typeof mode)} className="mt-1 accent-accent" />
        <span><span className="block text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted">{key === "first_order" ? "Vooraf betalen, daarna het volledige tegoed inzetten." : key === "spread" ? "Per order een percentage terugverdienen." : key === "free" ? "Habitat One betaalt. Er ontstaat geen tegoed." : "Beide partijen betalen een afgesproken deel. Geen tegoed."}</span></span>
      </label>)}</div>
      <Field label="Naam presentatiepakket"><Input name="title" defaultValue={initial.title} required maxLength={160} placeholder="Bijvoorbeeld: showroomwand Flexible Stone" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pakketwaarde (€ excl. btw)"><Input name="value" type="number" min="0.01" step="0.01" required value={value} onChange={e => setValue(e.target.value)} /></Field>
        <Field label="Onze werkelijke kostprijs (€ excl. btw, optioneel)"><Input name="cost" type="number" min="0" step="0.01" defaultValue={initial.cost} /></Field>
        {mode === "contribution" ? <Field label="Bijdrage Habitat One (€ excl. btw)"><Input name="contribution" type="number" min="0.01" step="0.01" required value={contribution} onChange={e => setContribution(e.target.value)} /></Field> : <input type="hidden" name="contribution" value="0" />}
        {mode !== "free" ? <Field label="Al ontvangen voor het pakket (€ excl. btw)"><Input name="paid" type="number" min="0" step="0.01" max={Number.isFinite(customer) ? customer : undefined} defaultValue={initial.paid} required /><span className="mt-1 text-xs text-muted">Handmatig bevestigde betaling; geen factuur of betaalverzoek.</span></Field> : <input type="hidden" name="paid" value="0" />}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 rounded-lg bg-background p-4 text-sm"><span>Klant betaalt <strong>{formatEUR(Number.isFinite(customer) ? customer : 0)}</strong></span><span>Verrekenbaar tegoed <strong>{formatEUR(refundable ? Number(value) || 0 : 0)}</strong></span></div>
      {mode === "spread" ? <Field label="Verrekening per order (% van netto productwaarde)"><Input name="rate" type="number" min="0.01" max="100" step="0.01" required defaultValue={Number(initial.rate) || 10} /></Field> : <input type="hidden" name="rate" value="0" />}
      {refundable ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Minimale orderwaarde (€ excl. btw)"><Input name="minimumOrder" type="number" min="0" step="0.01" defaultValue={initial.minimumOrder} required /></Field><Field label="Tegoed geldig tot en met (optioneel)"><Input name="expires" type="date" defaultValue={initial.expires} /></Field></div> : <><input type="hidden" name="minimumOrder" value="0" /><input type="hidden" name="expires" value="" /></>}
      {mode === "first_order" ? <Field label="Als de eerste order lager is dan het tegoed"><Select name="remainder" defaultValue={initial.remainder}><option value="minimum">Order moet het volledige tegoed kunnen dragen</option><option value="carry">Verreken tot de orderwaarde; restant naar volgende order</option></Select></Field> : <input type="hidden" name="remainder" value="minimum" />}
      <Field label="Inhoud en voorwaarden"><Textarea name="terms" required minLength={3} maxLength={6000} rows={5} defaultValue={initial.terms} placeholder="Welke panelen/display? Inclusief of exclusief montage en transport? Eigendom, plaatsing en overige afspraken." /></Field>
      <p className="text-xs text-muted">Dit is een interne commerciële afspraak. Opslaan verstuurt geen mail en verleent geen exclusiviteit of officiële dealerstatus.</p>
      <button className={button} disabled={pending}>{pending ? "Opslaan…" : "Afspraak opslaan"}</button>
    </fieldset>
    <Feedback state={state} />
  </form>;
}
export function RedemptionForm({ contactId, agreementId }: { contactId: string; agreementId: string }) {
  const [state, action, pending] = useActionState(bookRedemption, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="agreementId" value={agreementId} />
    <p className="text-sm text-muted">Registreer hier een korting die je al op de order of factuur hebt verwerkt. Deze registratie verlaagt alleen het presentatietegoed.</p>
    <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
      <Field label="Order- of factuurnummer"><Input name="reference" required minLength={2} maxLength={160} /></Field>
      <Field label="Netto productwaarde vóór presentatiekorting (€)"><Input name="order" type="number" min="0.01" step="0.01" required /></Field>
      <Field label="Verrekend bedrag (€ excl. btw)"><Input name="amount" type="number" min="0.01" step="0.01" required /></Field>
      <Field label="Toelichting"><Input name="note" maxLength={2000} /></Field>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input name="confirmed" type="checkbox" required className="mt-1" />Ik heb deze korting op de genoemde order/factuur verwerkt en de betalingsvoorwaarden gecontroleerd.</label>
      <button className={button} disabled={pending}>{pending ? "Registreren…" : "Verrekening registreren"}</button>
    </fieldset><Feedback state={state} />
  </form>;
}
export function VoidForm({ contactId, agreementId, entryId }: { contactId: string; agreementId: string; entryId: string }) {
  const [state, action, pending] = useActionState(voidRedemption, {});
  return <details className="mt-2"><summary className="cursor-pointer text-xs text-muted">Boeking corrigeren</summary><form action={action} className="mt-2 space-y-2">
    <input type="hidden" name="contactId" value={contactId} /><input type="hidden" name="agreementId" value={agreementId} /><input type="hidden" name="entryId" value={entryId} />
    <Input name="reason" aria-label="Reden correctie" required minLength={5} maxLength={1000} placeholder="Reden, bijvoorbeeld retour of verkeerde referentie" />
    <p className="text-xs text-muted">Herstelt het tegoed. De factuur wordt niet aangepast.</p><button className={button} disabled={pending}>Boeking terugdraaien</button><Feedback state={state} />
  </form></details>;
}
