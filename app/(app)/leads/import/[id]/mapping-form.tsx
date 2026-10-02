"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

import { useState } from "react";

import { Button, Field, Input, Select } from "@/components/ui";
import { PROSPECT_FIELD_LABEL, type ProspectField } from "@/lib/leads/prospect-columns";

/** De keuzes in de dropdown, in de volgorde waarin je ze zoekt. */
const VELDEN: ProspectField[] = [
  "companyName",
  "email",
  "phone",
  "website",
  "addressLine",
  "postalCode",
  "city",
  "province",
  "country",
  "sector",
  "notes",
  "contactPersonName",
  "tag",
  "ignore",
];

export function MappingForm({
  id,
  koppen,
  voorbeelden,
  mapping: initieel,
  bladen,
  sheetName,
  headerRow,
  saveAction,
}: {
  id: string;
  koppen: string[];
  /** Per kolom een paar waarden uit het bestand, om te zien wat erin staat. */
  voorbeelden: string[][];
  mapping: (ProspectField | null)[];
  bladen: string[];
  sheetName: string;
  headerRow: number;
  saveAction: (id: string, formData: FormData) => Promise<void>;
}) {
  const uiT = useUiTranslation();
  const [mapping, setMapping] = useState<(ProspectField | null)[]>(
    koppen.map((_, i) => initieel[i] ?? null),
  );
  const [busy, setBusy] = useState(false);

  const gekozen = new Set(mapping.filter((m): m is ProspectField => !!m && m !== "tag" && m !== "ignore"));
  const naamOntbreekt = !gekozen.has("companyName");

  async function opslaan(formData: FormData) {
    setBusy(true);
    formData.set("mapping", JSON.stringify(mapping.map((m) => m ?? "ignore")));
    try {
      await saveAction(id, formData);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={opslaan} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={uiT("Blad")} htmlFor="m-sheet" hint={bladen.length > 1 ? uiT("{v0} bladen in dit bestand", { v0: bladen.length }) : undefined}>
          <Select id="m-sheet" name="sheetName" defaultValue={sheetName}>
            {bladen.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={uiT("Op welke rij staan de kolomnamen?")}
          htmlFor="m-header"
          hint={uiT("Meestal 1. Gekochte lijsten hebben soms een titelregel erboven.")}
        >
          <Input id="m-header" name="headerRow" type="number" min={1} max={20} defaultValue={headerRow} />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-background-soft text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2 text-left">{uiT("Kolom in het bestand")}</th>
              <th className="px-3 py-2 text-left">{uiT("Wordt")}</th>
              <th className="px-3 py-2 text-left">{uiT("Voorbeelden")}</th>
            </tr>
          </thead>
          <tbody>
            {koppen.map((kop, i) => {
              const onbekend = mapping[i] === null;
              return (
                <tr key={`${kop}-${i}`} className={onbekend ? "bg-warning/5" : undefined}>
                  <td className="px-3 py-2 font-medium">
                    {kop || <span className="text-muted">{uiT("(kolom")} {i + 1}{uiT(", geen naam)")}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={mapping[i] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => {
                          const n = [...m];
                          n[i] = (e.target.value || null) as ProspectField | null;
                          return n;
                        })
                      }
                      className="h-8 w-56 text-xs"
                    >
                      <option value="">{uiT("— nog kiezen —")}</option>
                      {VELDEN.map((v) => (
                        <option
                          key={v}
                          value={v}
                          disabled={v !== "tag" && v !== "ignore" && gekozen.has(v) && mapping[i] !== v}
                        >
                          {PROSPECT_FIELD_LABEL[v]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="max-w-[24rem] px-3 py-2 text-xs text-muted">
                    {(voorbeelden[i] ?? []).filter(Boolean).slice(0, 3).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {naamOntbreekt && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          {uiT("Wijs één kolom aan als")} <strong>{uiT("Bedrijfsnaam")}</strong>{uiT(". Zonder naam is een rij niets.")} </p>
      )}
      <p className="text-xs text-muted">
        {uiT("Een kolom op")} <strong>{uiT("Bewaren als label")}</strong> {uiT("komt als los label bij de prospect te staan, bijvoorbeeld \"Aantal medewerkers: 10-50\". Zo gaat informatie uit het bestand niet verloren zonder dat het CRM er een veld voor nodig heeft.")} <strong>{uiT("Contactpersoon")}</strong> {uiT("wordt wel ingelezen maar nooit als aanhef in een mail gebruikt — de mail spreekt het bedrijf aan, niet de persoon.")} </p>

      <Button type="submit" disabled={busy || naamOntbreekt}>
        {busy ? uiT("Bezig…") : uiT("Kolommen opslaan en voorbeeld bekijken")}
      </Button>
    </form>
  );
}
