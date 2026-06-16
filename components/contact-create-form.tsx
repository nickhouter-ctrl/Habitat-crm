"use client";

import { useRef, useState } from "react";

import type { AddressSuggestion } from "@/app/(app)/documents/actions";
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
  email?: string | null;
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
  submitLabel = "Contact opslaan",
}: {
  action: (formData: FormData) => void | Promise<void>;
  onSuggest: (query: string) => Promise<AddressSuggestion[]>;
  initial?: ContactFormInitial;
  submitLabel?: string;
}) {
  const [type, setType] = useState<Klanttype>(initial?.klanttype ?? "particulier");
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

      <Field label="Type klant">
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
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Voornaam" htmlFor="firstName">
          <Input id="firstName" name="firstName" autoComplete="given-name" defaultValue={initial?.firstName ?? ""} />
        </Field>
        <Field label="Achternaam" htmlFor="lastName">
          <Input id="lastName" name="lastName" autoComplete="family-name" defaultValue={initial?.lastName ?? ""} />
        </Field>
      </div>

      {type === "zakelijk" && (
        <Field label="Bedrijfsnaam" htmlFor="companyName">
          <Input
            id="companyName"
            name="companyName"
            placeholder="bv. Bouwbedrijf X SL"
            defaultValue={initial?.companyName ?? ""}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="Telefoon" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
        </Field>
      </div>

      <Field
        label="Adres (straat + nr.)"
        htmlFor="addressLine"
        hint="Begin te typen en kies het juiste adres — postcode en plaats vullen we dan automatisch in."
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
            placeholder="bv. Camí de la Fontana 3"
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
        <Field label="Postcode" htmlFor="postalCode">
          <Input id="postalCode" name="postalCode" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
        </Field>
        <Field label="Plaats" htmlFor="city">
          <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Provincie" htmlFor="province">
          <Input id="province" name="province" value={province} onChange={(e) => setProvince(e.target.value)} />
        </Field>
      </div>

      <Field label="Voorkeurstaal" htmlFor="preferredLanguage" hint="Voor offertes, facturen en herinneringen.">
        <Select id="preferredLanguage" name="preferredLanguage" defaultValue={initial?.preferredLanguage ?? "es"}>
          <option value="es">Spaans</option>
          <option value="nl">Nederlands</option>
          <option value="en">Engels</option>
          <option value="de">Duits</option>
        </Select>
      </Field>

      <Field label="Notities" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={initial?.notes ?? ""} />
      </Field>

      <div className="pt-1">
        <SubmitButton pendingLabel="Opslaan…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
