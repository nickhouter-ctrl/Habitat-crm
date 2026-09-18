"use client";

import { useRef, useState } from "react";

import { Button, Field, Input, Select } from "@/components/ui";

type SignResult = { path: string; token: string; signedUrl: string; contentType: string };

const CATEGORIEEN = [
  ["architect", "Architect"],
  ["aannemer", "Aannemer"],
  ["makelaar", "Makelaar"],
  ["interieur", "Interieur"],
  ["projectontwikkelaar", "Projectontwikkelaar"],
  ["hovenier", "Hovenier"],
  ["overig", "Overig"],
] as const;

/**
 * Het bestand gaat rechtstreeks naar Supabase met een signed URL, en pas daarna
 * gaat de rest van het formulier naar de server. Dat is nodig omdat een
 * server action een body van ongeveer 4,5 MB aankan en een Excel-lijst daar
 * makkelijk boven komt — en dan zou het pas in productie stukgaan.
 */
export function UploadForm({
  signAction,
  registerAction,
}: {
  signAction: (filename: string, contentType?: string) => Promise<SignResult>;
  registerAction: (formData: FormData) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fout, setFout] = useState("");
  const [stap, setStap] = useState("");

  async function verstuur(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const file = inputRef.current?.files?.[0];
    if (!file) return setFout("Kies eerst een bestand.");
    if (file.size > 25 * 1024 * 1024) return setFout("Het bestand is groter dan 25 MB.");

    setBusy(true);
    setFout("");
    try {
      setStap("Bestand uploaden…");
      const sign = await signAction(file.name, file.type);
      const res = await fetch(sign.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type || "application/octet-stream" },
      });
      if (!res.ok) throw new Error(`Upload mislukt (${res.status}).`);

      setStap("Kolommen bekijken…");
      const fd = new FormData(form);
      fd.set("path", sign.path);
      fd.set("filename", file.name);
      await registerAction(fd);
      // registerAction eindigt met een redirect; hier komen we normaal niet.
    } catch (err) {
      // Next gooit bij een redirect een speciale fout — die is geen probleem.
      const bericht = err instanceof Error ? err.message : "Upload mislukt.";
      if (bericht.includes("NEXT_REDIRECT")) return;
      setFout(bericht);
      setBusy(false);
      setStap("");
    }
  }

  return (
    <form onSubmit={verstuur} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bestand (Excel of CSV)" htmlFor="imp-file">
          <input
            ref={inputRef}
            id="imp-file"
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,.tsv,.txt"
            required
            disabled={busy}
            className="w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent"
          />
        </Field>
        <Field label="Naam van de lijst" htmlFor="imp-label" hint="Zo heet deze batch in het overzicht">
          <Input id="imp-label" name="label" required placeholder="Architecten Alicante — sept 2026" disabled={busy} />
        </Field>
      </div>

      <Field
        label="Waar komt deze lijst vandaan?"
        htmlFor="imp-prov"
        hint="Verplicht. Bij een klacht of een vraag van de AEPD moet je dit kunnen laten zien."
      >
        <Input
          id="imp-prov"
          name="provenance"
          required
          minLength={3}
          placeholder="Gekocht bij … / eigen onderzoek via openbare bronnen"
          disabled={busy}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Leverancier van de lijst" htmlFor="imp-vendor" hint="Leeg laten als je hem zelf hebt opgebouwd">
          <Input id="imp-vendor" name="vendor" placeholder="Naam leverancier" disabled={busy} />
        </Field>
        <Field label="Aangeschaft op" htmlFor="imp-date">
          <Input id="imp-date" name="acquiredAt" type="date" disabled={busy} />
        </Field>
        <Field label="Factuur- of contractnummer" htmlFor="imp-ref">
          <Input id="imp-ref" name="vendorRef" placeholder="Referentie" disabled={busy} />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Categorie voor deze hele lijst" htmlFor="imp-cat">
          <Select id="imp-cat" name="defaultCategory" defaultValue="overig" disabled={busy}>
            {CATEGORIEEN.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Taal van de mail" htmlFor="imp-lang">
          <Select id="imp-lang" name="language" defaultValue="es" disabled={busy}>
            <option value="es">Spaans</option>
            <option value="nl">Nederlands</option>
            <option value="en">Engels</option>
            <option value="de">Duits</option>
          </Select>
        </Field>
      </div>

      {fout && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{fout}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? stap || "Bezig…" : "Uploaden en kolommen bekijken"}
        </Button>
        <p className="text-xs text-muted">Er wordt nog niets geïmporteerd — je krijgt eerst een voorbeeld te zien.</p>
      </div>
    </form>
  );
}
