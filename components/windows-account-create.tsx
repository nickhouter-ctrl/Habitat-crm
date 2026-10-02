"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';
import { useActionState, useState } from "react";
import { createWindowsCustomer } from "@/app/(app)/accounts/actions";
import { Button, Card, Field, Input, Select } from "@/components/ui";
const registrationLink = "https://windows.habitat-one.com/register";
export function WindowsAccountCreate() {
  const uiT = useUiTranslation();
  const [state,action,pending]=useActionState(createWindowsCustomer,{});
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState(false);
  return <Card className="mb-5"><details><summary className="cursor-pointer px-5 py-4 font-semibold">{uiT("+ Nieuwe zakelijke klant / aanvraaglink")}</summary>
    <div className="grid gap-6 border-t border-border p-5 lg:grid-cols-2">
      <section><h3 className="mb-2 font-semibold">{uiT("Klant zelf laten aanvragen")}</h3><p className="mb-3 text-sm text-muted">{uiT("De klant vult bedrijfsgegevens en btw-nummer in. De aanvraag verschijnt hier ter goedkeuring. Na goedkeuring stelt de klant zelf een wachtwoord in.")}</p>
        <Field label={uiT("Aanvraaglink")}><Input value={registrationLink} readOnly onFocus={e=>e.currentTarget.select()}/></Field>
        <Button type="button" variant="secondary" className="mt-3" onClick={async()=>{try{await navigator.clipboard.writeText(registrationLink);setCopied(true);setCopyError(false);}catch{setCopyError(true);}}}>{copied?uiT("Link gekopieerd"):uiT("Aanvraaglink kopiëren")}</Button>
        <a className="ml-3 text-sm underline" href={`mailto:?subject=${encodeURIComponent("Aanvraag Habitat Windows-account")}&body=${encodeURIComponent("Vraag je zakelijke Habitat Windows-account aan en vul je bedrijfsgegevens en btw-nummer in via:\n\n"+registrationLink)}`}>{uiT("Delen per e-mail")}</a>
        <p role="status" className="mt-2 text-sm text-muted">{copyError?uiT("Selecteer en kopieer de link hierboven."):copied?uiT("Plak de link in je e-mail of WhatsApp-bericht."):uiT("Deel deze link per e-mail of WhatsApp.")}</p>
      </section>
      <section><h3 className="mb-2 font-semibold">{uiT("Nieuwe zakelijke klant toevoegen")}</h3><p className="mb-3 text-sm text-muted">{uiT("Je keurt Windows-toegang direct goed. De klant ontvangt een link om zelf een wachtwoord in te stellen. Website-toegang blijft uit.")}</p>
        <form action={action} className="grid gap-3 sm:grid-cols-2">
          <Field label={uiT("Contactpersoon")}><Input name="name" required maxLength={200}/></Field>
          <Field label={uiT("E-mailadres")}><Input name="email" type="email" required maxLength={200}/></Field>
          <Field label={uiT("Bedrijfsnaam")}><Input name="businessName" required maxLength={200}/></Field>
          <Field label={uiT("BTW-/IVA-nummer (verplicht)")}><Input name="vatNumber" required maxLength={60}/></Field>
          <Field label={uiT("Telefoon")}><Input name="phone" type="tel" maxLength={40}/></Field>
          <Field label={uiT("Taal activatiemail")}><Select name="locale" defaultValue="nl"><option value="nl">Nederlands</option><option value="en">English</option><option value="es">Español</option><option value="de">Deutsch</option></Select></Field>
          <Field label={uiT("Bedrijfsadres")} className="sm:col-span-2"><Input name="address" maxLength={400}/></Field>
          {state.error&&<p role="alert" className="text-sm text-danger sm:col-span-2">{uiT(state.error ?? "")}</p>}{state.success&&<p role="status" className="text-sm text-success sm:col-span-2">{uiT(state.success ?? "")}</p>}
          <Button type="submit" disabled={pending} className="sm:col-span-2">{pending?uiT("Aanmaken…"):uiT("Klant toevoegen en toegang geven")}</Button>
        </form>
      </section>
    </div>
  </details></Card>;
}
