"use client";
import { useT as useUiTranslation } from '@/components/taal-provider';

/**
 * Mailformulier met AI-concept: de medewerker typt (optioneel) kort wat 'ie
 * wil zeggen, klikt "Schrijf met AI" en krijgt een nette, professionele mail
 * in de taal van de klant — die daarna gewoon te bewerken is. Vraagt de
 * aanwijzing om een brochure, dan vinkt de AI die ook meteen aan als bijlage
 * (uit de /catalogi-bibliotheek). Versturen blijft altijd een aparte,
 * bewuste klik — en je ziet vóór het versturen exact welke bijlagen meegaan.
 */
import { useState, useTransition } from "react";
import { useRef } from "react";
import { Upload } from "tus-js-client";

import { SubmitButton } from "@/components/submit-button";
import { Input, Textarea } from "@/components/ui";

export interface MailBijlageOptie {
  /** Pad in de catalogi-bucket (tevens bestandsnaam). */
  path: string;
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

export function AiMailForm({
  verstuur,
  genereer,
  defaultSubject,
  toEmail,
  placeholder,
  aiBeschikbaar,
  bijlagen = [],
  suggestie,
  initialBody = "",
  saveDraft,
  initialAttachments = [],
  downloadBijlagen = [],
  uploadDownloadBijlage,
  returnTo,
}: {
  returnTo?: string;
  initialBody?: string;
  initialAttachments?: string[];
  downloadBijlagen?: MailBijlageOptie[];
  uploadDownloadBijlage?: (filename: string, contentType: string, size: number) => Promise<{ path: string; token: string; endpoint: string; objectPath: string; bucketName: string }>;
  saveDraft?: (body: string, subject: string, attachments: string[]) => Promise<void>;
  /** Server action die de mail verstuurt (leest `subject`, `message` en `bijlage[]`). */
  verstuur: (formData: FormData) => Promise<void>;
  /** Server action die een AI-concept teruggeeft; de aanwijzing = wat er nu in het tekstvak staat. */
  genereer: (
    instructie: string,
  ) => Promise<{ subject: string; body: string; bijlagen: string[] } | null>;
  defaultSubject: string;
  toEmail: string;
  placeholder?: string;
  aiBeschikbaar: boolean;
  /** Beschikbare brochures/catalogi die als bijlage mee kunnen. */
  bijlagen?: MailBijlageOptie[];
  /** Extra AI-knop met een vaste aanwijzing (bv. een opvolg-herinnering):
   *  { label: "✨ Schrijf herinnering", instructie: "..." }. */
  suggestie?: { label: string; instructie: string };
}) {
  const uiT = useUiTranslation();
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(initialBody);
  const [gekozen, setGekozen] = useState<Set<string>>(new Set(initialAttachments));
  const [gekozenLinks, setGekozenLinks] = useState<Set<string>>(new Set());
  const [downloadLijst, setDownloadLijst] = useState(downloadBijlagen);
  const [uploadBezig, setUploadBezig] = useState(false);
  const [uploadVoortgang, setUploadVoortgang] = useState(0);
  const [uploadFout, setUploadFout] = useState("");
  const uploadInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState(false);
  const [fout, setFout] = useState(false);
  const [bezig, startTransition] = useTransition();

  const totaalBytes = bijlagen
    .filter((b) => gekozen.has(b.path))
    .reduce((sum, b) => sum + b.size, 0);
  const teGroot = totaalBytes > 20 * 1024 * 1024;

  function toggle(path: string) {
    setSaved(false);
    setGekozen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleDownload(path: string) {
    setSaved(false);
    setGekozenLinks((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function uploadPdf(file: File) {
    setUploadFout("");
    if (!uploadDownloadBijlage) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== "application/pdf")) {
      setUploadFout(uiT("Alleen PDF-bestanden zijn toegestaan."));
      return;
    }
    if (file.size > 250 * 1024 * 1024) {
      setUploadFout(uiT("Een PDF mag maximaal 250 MB zijn."));
      return;
    }
    setUploadBezig(true);
    try {
      const sign = await uploadDownloadBijlage(file.name, "application/pdf", file.size);
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint: sign.endpoint,
          headers: { "x-signature": sign.token },
          metadata: { bucketName: sign.bucketName, objectName: sign.objectPath, contentType: "application/pdf", cacheControl: "3600" },
          chunkSize: 6 * 1024 * 1024,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          removeFingerprintOnSuccess: true,
          onProgress: (sent, total) => setUploadVoortgang(Math.round((sent / total) * 100)),
          onError: reject,
          onSuccess: () => resolve(),
        });
        upload.start();
      });
      const option = { path: sign.path, name: file.name, size: file.size };
      setDownloadLijst((old) => [option, ...old.filter((item) => item.path !== sign.path)]);
      setGekozenLinks((old) => new Set([...old, sign.path]));
      setSaved(false);
    } catch (e) {
      setUploadFout(e instanceof Error ? e.message : uiT("Uploaden is niet gelukt."));
    } finally {
      setUploadBezig(false);
      setUploadVoortgang(0);
      if (uploadInput.current) uploadInput.current.value = "";
    }
  }

  function schrijfMetAi(instructie?: string) {
    setFout(false);
    startTransition(async () => {
      const concept = await genereer(instructie ?? message.trim());
      if (!concept) {
        setFout(true);
        return;
      }
      setSubject(concept.subject);
      setMessage(concept.body);
      setSaved(false);
      if (concept.bijlagen.length > 0) setGekozen(new Set(concept.bijlagen));
    });
  }

  return (
    <form action={verstuur} className="space-y-2">
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <Input name="subject" value={subject} onChange={(e) => { setSubject(e.target.value); setSaved(false); }} />
      <Textarea
        name="message"
        rows={message ? 12 : 4}
        required
        value={message}
        onChange={(e) => { setMessage(e.target.value); setSaved(false); }}
        placeholder={placeholder ?? uiT("Bijv. een extra vraag aan de klant…")}
      />
      {saveDraft && <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" disabled={saving} className="rounded-md border border-border px-3 py-2 hover:bg-background-soft disabled:opacity-50"
          onClick={() => { setSaveError(false); startSaving(async () => { try { await saveDraft(message, subject, [...gekozen]); setSaved(true); } catch { setSaveError(true); } }); }}>
          {saving ? uiT("Opslaan…") : uiT("Concept opslaan")}
        </button>
        {saved && <span className="text-success">{uiT("Concept opgeslagen in het CRM")}</span>}
        {saveError && <span className="text-warning">{uiT("Opslaan mislukt; je tekst staat nog in dit veld.")}</span>}
      </div>}
      {aiBeschikbaar && (
        <>
          <div className={suggestie ? "grid grid-cols-2 gap-2" : ""}>
            <button
              type="button"
              onClick={() => schrijfMetAi()}
              disabled={bezig}
              className="w-full rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
            >
              {bezig ? uiT("AI schrijft…") : uiT("✨ Schrijf met AI")}
            </button>
            {suggestie && (
              <button
                type="button"
                onClick={() => schrijfMetAi(suggestie.instructie)}
                disabled={bezig}
                className="w-full rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-60"
              >
                {bezig ? uiT("AI schrijft…") : uiT(suggestie.label)}
              </button>
            )}
          </div>
          {fout && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              {uiT("AI-concept lukte even niet — probeer opnieuw of schrijf zelf.")} </p>
          )}
          <p className="text-xs text-muted">
            {uiT("Tip: typ eerst in het kort wat je wilt zeggen (of laat leeg) en klik ✨ — de AI maakt er een nette mail van in de taal van de klant. Vraag je om een brochure mee te sturen, dan vinkt de AI die hieronder aan. Je kunt alles nog aanpassen vóór het versturen.")} </p>
        </>
      )}
      {(bijlagen.length > 0 || downloadLijst.length > 0 || uploadDownloadBijlage) && (
        <details className="rounded-md border border-border" open={gekozen.size > 0 || gekozenLinks.size > 0 || downloadLijst.some((item) => item.path.startsWith("brochure:"))}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover:text-foreground">
            {uiT("📎 PDF meesturen")}{gekozen.size + gekozenLinks.size > 0 ? uiT(" ({v0} gekozen)", { v0: gekozen.size + gekozenLinks.size }) : ""}
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {uploadDownloadBijlage && <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={uploadBezig} onClick={() => uploadInput.current?.click()} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-background-soft disabled:opacity-50">
                {uploadBezig ? uiT("PDF uploaden… {v0}%", { v0: uploadVoortgang }) : uiT("PDF uploaden als downloadlink")}
              </button>
              <input ref={uploadInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadPdf(file); }} />
              <span className="text-xs text-muted">{uiT("Maximaal 250 MB; de link blijft werken zolang het bestand beschikbaar is.")}</span>
            </div>}
            {uploadFout && <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">{uploadFout}</p>}
            <div className="max-h-52 space-y-1 overflow-y-auto">
            {bijlagen.map((b) => (
              <label
                key={b.path}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-background-soft"
              >
                <input
                  type="checkbox"
                  checked={gekozen.has(b.path)}
                  onChange={() => toggle(b.path)}
                  className="accent-[var(--accent,#b4552d)]"
                />
                <span className="min-w-0 flex-1 truncate" title={b.name}>
                  {b.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{formatSize(b.size)}</span>
              </label>
            ))}
            {downloadLijst.map((b) => (
              <label key={b.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-background-soft">
                <input type="checkbox" checked={gekozenLinks.has(b.path)} onChange={() => toggleDownload(b.path)} className="accent-[var(--accent,#b4552d)]" />
                <span className="min-w-0 flex-1 truncate" title={b.name}>{b.name}</span>
                <span className="shrink-0 text-muted">{formatSize(b.size)} · {uiT("downloadlink")}</span>
              </label>
            ))}
            </div>
          </div>
        </details>
      )}
      {teGroot && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          {uiT("Bijlagen samen groter dan 20 MB — dat past niet in één mail. Kies er minder.")} </p>
      )}
      {[...gekozen].map((path) => (
        <input key={path} type="hidden" name="bijlage" value={path} />
      ))}
      {[...gekozenLinks].map((path) => (
        <input key={path} type="hidden" name="downloadLink" value={path} />
      ))}
      {/* Conditionele spread: een expliciete `disabled` zou anders de eigen
          pending-disable van SubmitButton overschrijven. */}
      <SubmitButton variant="secondary" className="w-full" pendingLabel={uiT("Versturen…")} {...(teGroot ? { disabled: true } : {})}>
        {uiT("Versturen naar")} {toEmail}
        {gekozen.size > 0 ? uiT(" (+{v0} bijlage{v1})", { v0: gekozen.size, v1: gekozen.size === 1 ? "" : "n" }) : ""}
        {gekozenLinks.size > 0 ? uiT(" (+{v0} downloadlink{v1})", { v0: gekozenLinks.size, v1: gekozenLinks.size === 1 ? "" : "s" }) : ""}
      </SubmitButton>
    </form>
  );
}
