"use client";

import { useState } from "react";

/** Knopje dat een link naar het klembord kopieert (bv. om via WhatsApp te delen). */
export function CopyLinkButton({ url, label = "Kopieer link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded-md border bg-surface px-2 py-1 text-xs font-medium shadow-sm hover:bg-background"
    >
      {copied ? "✓ Gekopieerd" : label}
    </button>
  );
}
