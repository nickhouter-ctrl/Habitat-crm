"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";

type SignResult = { path: string; token: string; signedUrl: string; contentType: string };
type Meta = { name: string; path: string; size: number; contentType: string };

/**
 * Upload bijlagen RECHTSTREEKS naar Supabase (via een signed URL van de server),
 * zodat grote PDF's (kozijn-tekeningen) niet tegen Vercel's ~4,5 MB body-limiet
 * van server-actions lopen. Daarna registreren we alleen de metadata.
 */
export function DocumentAttachmentsUploader({
  documentId,
  signAction,
  attachAction,
}: {
  documentId: string;
  signAction: (id: string, filename: string, contentType?: string) => Promise<SignResult>;
  attachAction: (id: string, files: Meta[]) => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  async function upload() {
    const files = Array.from(inputRef.current?.files ?? []).filter((f) => f.size > 0);
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    const done: Meta[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" is groter dan 25 MB.`);
        setProgress(`Uploaden ${i + 1}/${files.length}: ${file.name}…`);
        const sign = await signAction(documentId, file.name, file.type);
        const res = await fetch(sign.signedUrl, {
          method: "PUT",
          body: file,
          headers: { "content-type": file.type || "application/octet-stream" },
        });
        if (!res.ok) throw new Error(`Upload van "${file.name}" mislukt (${res.status}).`);
        done.push({ name: file.name, path: sign.path, size: file.size, contentType: sign.contentType });
      }
      await attachAction(documentId, done);
      if (inputRef.current) inputRef.current.value = "";
      setProgress("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/*"
        disabled={busy}
        className="text-sm file:mr-3 file:rounded file:border-0 file:bg-accent/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
      />
      <Button type="button" size="sm" variant="secondary" onClick={upload} disabled={busy}>
        {busy ? "Uploaden…" : "Toevoegen"}
      </Button>
      {progress && <span className="text-xs text-muted">{progress}</span>}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
