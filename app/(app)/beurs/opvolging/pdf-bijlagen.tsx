"use client";
import { useRef, useState } from "react";
import { Upload } from "tus-js-client";
import { useT } from "@/components/taal-provider";
import { signFollowupLargePdfUpload, signFollowupPdfUpload } from "./actions";

export type BibliotheekPdf = { path: string; name: string; size: number; downloadOnly?: boolean };

/** Moet gelijk lopen met MAX_BIJLAGEN in actions.ts; de server controleert het opnieuw. */
const MAX_BIJLAGEN = 18 * 1024 * 1024;
const MAX_BESTAND = 250 * 1024 * 1024;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

/**
 * PDF's uit de bibliotheek aanvinken als bijlage of downloadlink. Grote uploads
 * gaan naar een aparte private bucket en worden via een blijvende link gedeeld.
 *
 * Uploaden gaat rechtstreeks van de browser naar de opslag, dus grote bestanden
 * gaan niet door de server action-bodylimiet van Vercel.
 */
export function PdfBijlagen({ bibliotheek, gekozen, onChange, downloadLinks, onDownloadLinksChange, vasteBytes = 0 }: {
  bibliotheek: BibliotheekPdf[];
  gekozen: string[];
  onChange: (paden: string[]) => void;
  downloadLinks: string[];
  onDownloadLinksChange: (paden: string[]) => void;
  /** Wat er al vast meegaat (data sheets, ontwerpen), voor de totaalteller. */
  vasteBytes?: number;
}) {
  const t = useT();
  const [lijst, setLijst] = useState(bibliotheek);
  const [bezig, setBezig] = useState(false);
  const [voortgang, setVoortgang] = useState(0);
  const [fout, setFout] = useState("");
  const bestand = useRef<HTMLInputElement>(null);

  const totaal = vasteBytes + lijst.filter((p) => gekozen.includes(p.path)).reduce((a, p) => a + p.size, 0);
  const wissel = (pad: string, mode: 'attachment' | 'link') => {
    onChange(mode === 'attachment' ? [...gekozen.filter((p) => p !== pad), ...(gekozen.includes(pad) ? [] : [pad])] : gekozen.filter((p) => p !== pad));
    onDownloadLinksChange(mode === 'link' ? [...downloadLinks.filter((p) => p !== pad), ...(downloadLinks.includes(pad) ? [] : [pad])] : downloadLinks.filter((p) => p !== pad));
  };

  async function upload(file: File, fileIndex: number, fileCount: number) {
    setFout("");
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) return setFout(t("Alleen PDF-bestanden."));
    if (file.size > MAX_BESTAND) return setFout(t("Dit bestand is groter dan 250 MB."));
    try {
      let path: string;
      if (file.size > 25 * 1024 * 1024) {
        const sign = await signFollowupLargePdfUpload(file.name, file.type || "application/pdf", file.size);
        await new Promise<void>((resolve, reject) => {
          const upload = new Upload(file, {
            endpoint: sign.endpoint,
            headers: { "x-signature": sign.token },
            metadata: { bucketName: sign.bucketName, objectName: sign.objectPath, contentType: "application/pdf", cacheControl: "3600" },
            chunkSize: 6 * 1024 * 1024,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            removeFingerprintOnSuccess: true,
            onProgress: (sent, total) => setVoortgang(Math.round(((fileIndex + sent / total) / fileCount) * 100)),
            onError: reject,
            onSuccess: () => resolve(),
          });
          upload.start();
        });
        path = sign.path;
      } else {
        const sign = await signFollowupPdfUpload(file.name, file.type || "application/pdf");
        const res = await fetch(sign.signedUrl, { method: "PUT", body: file, headers: { "content-type": "application/pdf" } });
        if (!res.ok) throw new Error(`Upload mislukt (${res.status}).`);
        path = sign.path;
      }
      const nieuw = { path, name: file.name, size: file.size };
      setLijst((oud) => [nieuw, ...oud.filter((p) => p.path !== nieuw.path)]);
      if (file.size > MAX_BIJLAGEN || totaal + file.size > MAX_BIJLAGEN) {
        onChange(gekozen.filter((p) => p !== nieuw.path));
        onDownloadLinksChange([...new Set([...downloadLinks, nieuw.path])]);
      } else {
        onDownloadLinksChange(downloadLinks.filter((p) => p !== nieuw.path));
        onChange([...new Set([...gekozen, nieuw.path])]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setFout(/413|maximum.*size|exceed.*size/i.test(message)
        ? t("De opslaglimiet van het Supabase-project is lager dan dit bestand. Verhoog de globale limiet naar minstens 250 MB.")
        : message || t("Upload mislukt. Controleer of de projectlimiet voor opslag minstens 250 MB is."));
    }
  }

  async function uploadBestanden(files: FileList | null) {
    if (!files?.length) return;
    setBezig(true); setVoortgang(0); setFout("");
    try {
      for (const [i, file] of Array.from(files).entries()) await upload(file, i, files.length);
    } finally {
      setBezig(false); setVoortgang(0);
      if (bestand.current) bestand.current.value = "";
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("PDF's meesturen")}</span>
        <button type="button" disabled={bezig} onClick={() => bestand.current?.click()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50">
      {bezig ? `${t("Uploaden…")} ${voortgang}%` : t("PDF uploaden")}
        </button>
        <input ref={bestand} type="file" multiple accept="application/pdf,.pdf" className="hidden"
          onChange={(e) => { void uploadBestanden(e.target.files); }} />
      </div>
      {lijst.length > 0 ? (
        <div className="max-h-52 space-y-1 overflow-y-auto">
          {lijst.map((p) => (
            <div key={p.path} className="flex flex-wrap items-center gap-2 rounded px-1 py-1 text-sm hover:bg-background">
              <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{mb(p.size)}</span>
              <button type="button" disabled={p.downloadOnly} aria-pressed={gekozen.includes(p.path)} onClick={() => wissel(p.path, 'attachment')} className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${gekozen.includes(p.path)?'border-accent bg-accent/10':''}`}>{t("Bijlage")}</button>
              <button type="button" aria-pressed={downloadLinks.includes(p.path)} onClick={() => wissel(p.path, 'link')} className={`rounded border px-2 py-1 text-xs ${downloadLinks.includes(p.path)?'border-accent bg-accent/10':''}`}>{t("Downloadlink")}</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">{t("Nog geen PDF's in de bibliotheek. Upload er een; die staat daarna ook bij Catalogi.")}</p>
      )}
      <p className={`text-xs ${totaal > MAX_BIJLAGEN ? "text-danger" : "text-muted"}`}>
        {totaal > MAX_BIJLAGEN
          ? t("Bijlagen samen {totaal} — maximaal {max} per mail. Vink er een uit.", { totaal: mb(totaal), max: mb(MAX_BIJLAGEN) })
          : t("Upload een of meer PDF’s tot 250 MB. Kies per bestand een bijlage of downloadlink.")}
      </p>
      {downloadLinks.some((path) => lijst.find((p) => p.path === path)?.downloadOnly) && <p className="text-xs text-muted">{t("Grote uploads staan privé opgeslagen. De downloadlink blijft werken zolang het bestand in het CRM staat.")}</p>}
      {downloadLinks.some((path) => !lijst.find((p) => p.path === path)?.downloadOnly) && <p className="text-xs text-warning">{t("Catalogusbestanden zijn openbaar voor iedereen met de link; gebruik ze alleen voor documenten die je met klanten mag delen.")}</p>}
      {fout && <p role="alert" className="text-xs text-danger">{t(fout)}</p>}
    </div>
  );
}
