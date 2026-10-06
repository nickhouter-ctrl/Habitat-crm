"use client";
import { TabsRoot, TabsBar, TabPanel } from "@/components/tabs";

import { useT as useUiTranslation } from '@/components/taal-provider';

import Link from "next/link";
import { useRef, useState } from "react";

import type { AddressSuggestion } from "@/app/(app)/documents/actions";
import { findDuplicateContact, validateVatNumber } from "@/app/(app)/contacts/actions";
import type { ViesResult } from "@/lib/vies";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

const TYPES = [
  { id: "particulier", label: "Particulier" },
  { id: "zakelijk", label: "Zakelijk" },
  { id: "leverancier", label: "Leverancier" },
  { id: "partner", label: "Partner" },
] as const;

type Klanttype = (typeof TYPES)[number]["id"];

export type ContactFormInitial = {
  klanttype?: Klanttype;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  companyVat?: string | null;
  taxId?: string | null;
  email?: string | null;
  additionalEmails?: string[];
  phone?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  preferredLanguage?: string | null;
  notes?: string | null;
};

export function ContactCreateForm({
  action,
  onSuggest,
  initial,
  hideNotes = false,
  submitLabel = "Contact opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  onSuggest: (query: string) => Promise<AddressSuggestion[]>;
  initial?: ContactFormInitial;
  hideNotes?: boolean;
  submitLabel?: string;
}) {
  const uiT = useUiTranslation();
  const [type, setType] = useState<Klanttype>(initial?.klanttype ?? "particulier");
  const isEdit = !!initial;
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  async function checkDup(form: HTMLFormElement | null) {
    if (isEdit || !form) return;
    const email = (form.elements.namedItem("email") as HTMLInputElement | null)?.value ?? "";
    const phone = (form.elements.namedItem("phone") as HTMLInputElement | null)?.value ?? "";
    if (!email.trim() && !phone.trim()) return setDup(null);
    try {
      setDup(await findDuplicateContact(email, phone));
    } catch {
      /* stil falen — de check is hulp, geen blokkade */
    }
  }
  const [vies, setVies] = useState<ViesResult | null>(null);
  const [viesLoading, setViesLoading] = useState(false);
  async function checkVies(value: string) {
    setVies(null);
    if (!value.trim()) return;
    setViesLoading(true);
    try {
      setVies(await validateVatNumber(value));
    } catch {
      /* stil falen */
    } finally {
      setViesLoading(false);
    }
  }
  const viesIndicator =
    viesLoading ? (
      <p className="mt-1 text-xs text-muted">{uiT("VIES controleren…")}</p>
    ) : vies ? (
      vies.valid ? (
        <p className="mt-1 text-xs text-success">{uiT("✓ Geldig EU-btw-nummer (VIES)")}{vies.name ? ` — ${vies.name}` : ""}</p>
      ) : (
        <p className="mt-1 text-xs text-danger">{uiT("✗ Dit btw-nummer is niet geldig volgens VIES")}</p>
      )
    ) : null;
  const [addr, setAddr] = useState(initial?.addressLine ?? "");
  const [postcode, setPostcode] = useState(initial?.postalCode ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [province, setProvince] = useState(initial?.province ?? "");
  const [sugs, setSugs] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onAddr = (v: string) => {
    setAddr(v);
    if (timer.current) clearTimeout(timer.current);
    const q = v.trim();
    if (q.length < 3) {
      setSugs([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const list = await onSuggest(q).catch(() => []);
      setSugs(list);
      setOpen(list.length > 0);
    }, 300);
  };

  const pick = (s: AddressSuggestion) => {
    const line = [s.street, s.houseNumber].filter(Boolean).join(" ") || s.label.split(",")[0];
    setAddr(line);
    if (s.postalCode) setPostcode(s.postalCode);
    if (s.city) setCity(s.city);
    if (s.province) setProvince(s.province);
    setSugs([]);
    setOpen(false);
  };

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="klanttype" value={type} />

      <TabsRoot defaultTab="data" ids={hideNotes?["data","address"]:["data","address","admin"]} param="form"><TabsBar tabs={[{id:"data",label:uiT("Contact")},{id:"address",label:uiT("Adres")},...(!hideNotes?[{id:"admin",label:uiT("Administratie")}]:[])]}/><TabPanel id="data"><Field label={uiT("Type klant")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                type === t.id
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "hover:bg-background",
              )}
            >
              {uiT(t.label)}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={uiT("Voornaam")} htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" defaultValue={initial?.firstName ?? ""} />
        </Field>
        <Field label={uiT("Achternaam")} htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" defaultValue={initial?.lastName ?? ""} />
        </Field>
      </div>

      {type === "zakelijk" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={uiT("Bedrijfsnaam")} htmlFor="companyName">
            <Input
              id="companyName"
              name="companyName"
              placeholder={uiT("bv. Bouwbedrijf X SL")}
              defaultValue={initial?.companyName ?? ""}
            />
          </Field>
          <Field label={uiT("CIF / NIF (btw-nummer)")} htmlFor="companyVat" hint={uiT("Verplicht op facturen in Spanje. Buitenlands nummer met landcode wordt tegen VIES gecheckt.")}>
            <Input
              id="companyVat"
              name="companyVat"
              placeholder={uiT("bv. B12345678 of NL123456789B01")}
              defaultValue={initial?.companyVat ?? ""}
              onBlur={(e) => checkVies(e.currentTarget.value)}
            />
            {viesIndicator}
          </Field>
        </div>
      )}</TabPanel>

      <TabPanel id="admin">{type !== "zakelijk" && (
        <Field
          label={uiT("NIE / BSN (fiscaal nummer)")}
          htmlFor="taxId"
          hint={uiT("Verplicht op facturen — NIE of DNI voor particulieren in Spanje, anders het BSN of buitenlandse fiscaal nummer.")}
        >
          <Input
            id="taxId"
            name="taxId"
            placeholder={uiT("bv. X1234567L of 123456782")}
            defaultValue={initial?.taxId ?? ""}
            onBlur={(e) => checkVies(e.currentTarget.value)}
          />
          {viesIndicator}
        </Field>
      )}</TabPanel>

      <TabPanel id="data"><div className="grid gap-4 sm:grid-cols-2">
        <Field label={uiT("E-mail")} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={initial?.email ?? ""} onBlur={(e) => checkDup(e.currentTarget.form)} />
        </Field>
        <Field label={uiT("Extra e-mailontvangers")} htmlFor="additionalEmails">
          <Input id="additionalEmails" name="additionalEmails" type="email" multiple defaultValue={initial?.additionalEmails?.join(", ") ?? ""} />
          <p className="mt-1 text-xs text-muted">{uiT("Deze adressen ontvangen ook klantmails. Scheid meerdere adressen met een komma.")}</p>
        </Field>
        <Field label={uiT("Telefoon")} htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} onBlur={(e) => checkDup(e.currentTarget.form)} />
        </Field>
      </div></TabPanel>

      {dup && !isEdit && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {uiT("Er bestaat al een contact met deze gegevens:")}{" "}
          <Link href={`/contacts/${dup.id}`} className="font-semibold underline" target="_blank">
            {dup.name}
          </Link>
          {uiT(". Controleer of je geen dubbele aanmaakt.")} </div>
      )}

      <TabPanel id="address"><Field
        label={uiT("Adres (straat + nr.)")}
        htmlFor="addressLine"
        hint={uiT("Begin te typen en kies het juiste adres — postcode en plaats vullen we dan automatisch in.")}
      >
        <div className="relative">
          <Input
            id="addressLine"
            name="addressLine"
            autoComplete="off"
            value={addr}
            onChange={(e) => onAddr(e.target.value)}
            onFocus={() => sugs.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={uiT("bv. Camí de la Fontana 3")}
          />
          {open && sugs.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-surface shadow-lg">
              {sugs.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-background"
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={uiT("Postcode")} htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </Field>
        <Field label={uiT("Plaats")} htmlFor="city">
          <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label={uiT("Provincie")} htmlFor="province">
          <Input id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)} />
        </Field>
      </div></TabPanel>

      <TabPanel id="data"><Field label={uiT("Voorkeurstaal")} htmlFor="preferredLanguage" hint={uiT("Voor offertes, facturen en herinneringen.")}>
        <Select id="preferredLanguage" name="preferredLanguage" defaultValue={initial?.preferredLanguage ?? "es"}>
          <option value="es">{uiT("Spaans")}</option>
          <option value="nl">Nederlands</option>
          <option value="en">{uiT("Engels")}</option>
          <option value="de">{uiT("Duits")}</option>
        </Select>
      </Field></TabPanel>

      {!hideNotes&&<TabPanel id="admin"><Field label={uiT("Notities")} htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field></TabPanel>}</TabsRoot>

      <div className="pt-1">
        <SubmitButton pendingLabel={uiT("Opslaan…")}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
