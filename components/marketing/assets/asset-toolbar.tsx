"use client";

/**
 * Werkbalk van de beeldbibliotheek: handmatige upload + sync-triggers voor de
 * website- en Instagram-bron. Praat met de API-routes uit fase 1 (T3) en
 * ververst daarna de servergerenderde lijst. Fouten komen zichtbaar in een
 * aria-live-regio — wat er misging én wat de gebruiker kan doen.
 */
import { CloudDownload, Instagram, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui";

type Busy = "upload" | "website" | "instagram" | null;

/** Respons-vorm van de sync-/uploadroutes (SyncSummary). */
interface SummaryResponse {
  ok?: boolean;
  stored?: number;
  duplicates?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
}

export function AssetToolbar() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  function describe(summary: SummaryResponse, bron: string): string {
    if (summary.error) return `${bron}: ${summary.error}`;
    const parts = [
      `${summary.stored ?? 0} nieuw`,
      `${summary.duplicates ?? 0} duplicaat`,
      ...(summary.skipped ? [`${summary.skipped} overgeslagen`] : []),
    ];
    const base = `${bron}: ${parts.join(", ")}.`;
    const errors = summary.errors ?? [];
    return errors.length > 0
      ? `${base} ${errors.length} mislukt — eerste fout: ${errors[0]}`
      : base;
  }

  async function run(kind: Exclude<Busy, null>, request: () => Promise<Response>, bron: string) {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await request();
      const body = (await res.json().catch(() => ({}))) as SummaryResponse;
      if (res.status === 401 || res.status === 403) {
        setMessage(body.error ?? "Geen rechten voor deze actie.");
        return;
      }
      setMessage(describe(body, bron));
      router.refresh();
    } catch {
      setMessage(`${bron}: netwerkfout — controleer de verbinding en probeer het opnieuw.`);
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const form = new FormData();
    for (const file of Array.from(files)) form.append("file", file);
    await run("upload", () => fetch("/api/assets/upload", { method: "POST", body: form }), "Upload");
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="sr-only"
        aria-label="Beelden uploaden"
        onChange={(e) => onUpload(e.target.files)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="mr-1.5 size-4" aria-hidden />
        {busy === "upload" ? "Bezig met uploaden…" : "Beelden uploaden"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={() =>
          run("website", () => fetch("/api/assets/sync/website", { method: "POST" }), "Website")
        }
      >
        <CloudDownload className="mr-1.5 size-4" aria-hidden />
        {busy === "website" ? "Website synct…" : "Sync website"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={busy !== null}
        onClick={() =>
          run(
            "instagram",
            () => fetch("/api/assets/sync/instagram", { method: "POST" }),
            "Instagram",
          )
        }
      >
        <Instagram className="mr-1.5 size-4" aria-hidden />
        {busy === "instagram" ? "Instagram synct…" : "Sync Instagram"}
      </Button>
      {/* aria-live zodat schermlezers de uitkomst van een sync/upload horen. */}
      <p aria-live="polite" className="basis-full text-xs text-muted">
        {message}
      </p>
    </div>
  );
}
