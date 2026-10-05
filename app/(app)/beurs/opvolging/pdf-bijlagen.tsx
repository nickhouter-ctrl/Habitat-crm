"use client";
import { useRef, useState } from "react";
import { useT } from "@/components/taal-provider";
import { signFollowupPdfUpload } from "./actions";

export type BibliotheekPdf = { path: string; name: string; size: number };

/** Moet gelijk lopen met MAX_BIJLAGEN in actions.ts; de server controleert het opnieuw. */
const MAX_BIJLAGEN = 18 * 1024 * 1024;
const MAX_BESTAND = 25 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/**
 * PDF's uit de bibliotheek (Catalogi) aanvinken als bijlage, of er zelf een
 * uploaden. Een upload komt in dezelfde bibliotheek, zodat hij bij een
 * volgende klant gewoon weer aan te vinken is.
 *
 * Uploaden gaat rechtstreeks van de browser naar de opslag: een presentatie van
 * 15 MB komt niet door een server action heen (Vercel kapt rond 4,5 MB af).
 */
export function PdfBijlagen({ bibliotheek, gekozen, onChange, vasteBytes = 0 }: {
  bibliotheek: BibliotheekPdf[];
  gekozen: string[];
  onChange: (paden: string[]) => void;
  /** Wat er al vast meegaat (data sheets, ontwerpen), voor de totaalteller. */
  vasteBytes?: number;
}) {
  const t = useT();
  const [lijst, setLijst] = useState(bibliotheek);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const bestand = useRef<HTMLInputElement>(null);

  const totaal = vasteBytes + lijst.filter((p) => gekozen.includes(p.path)).reduce((a, p) => a + p.size, 0);
  const wissel = (pad: string) => onChange(gekozen.includes(pad) ? gekozen.filter((p) => p !== pad) : [...gekozen, pad]);

  async function upload(file: File) {
    setFout("");
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) return setFout("Alleen PDF-bestanden.");
    if (file.size > MAX_BESTAND) return setFout("Dit bestand is groter dan 25 MB.");
    setBezig(true);
    try {
      const sign = await signFollowupPdfUpload(file.name, file.type || "application/pdf");
      const res = await fetch(sign.signedUrl, { method: "PUT", body: file, headers: { "content-type": "application/pdf" } });
      if (!res.ok) throw new Error(`Upload mislukt (${res.status}).`);
      const nieuw = { path: sign.path, name: sign.path, size: file.size };
      // Zelfde naam = vervangen, net als in Catalogi.
      setLijst((oud) => [nieuw, ...oud.filter((p) => p.path !== nieuw.path)]);
      if (!gekozen.includes(nieuw.path)) onChange([...gekozen, nieuw.path]);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Upload mislukt.");
    } finally {
      setBezig(false);
      if (bestand.current) bestand.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("PDF's meesturen")}</span>
        <button type="button" disabled={bezig} onClick={() => bestand.current?.click()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">
          {bezig ? t("Uploaden…") : t("PDF uploaden")}
        </button>
        <input ref={bestand} type="file" accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
      {lijst.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {lijst.map((p) => (
            <label key={p.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-background">
              <input type="checkbox" checked={gekozen.includes(p.path)} onChange={() => wissel(p.path)} />
              <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{mb(p.size)}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">{t("Nog geen PDF's in de bibliotheek. Upload er een; die staat daarna ook bij Catalogi.")}</p>
      )}
      <p className={`text-xs ${totaal > MAX_BIJLAGEN ? "text-danger" : "text-muted"}`}>
        {totaal > MAX_BIJLAGEN
          ? t("Bijlagen samen {totaal} — maximaal {max} per mail. Vink er een uit.", { totaal: mb(totaal), max: mb(MAX_BIJLAGEN) })
          : t("Een upload komt in de bibliotheek (Catalogi) en is daarna bij elke mail aan te vinken.")}
      </p>
      {fout && <p role="alert" className="text-xs text-danger">{t(fout)}</p>}
    </div>
  );
}
