"use client";

import { Star } from "lucide-react";
import { useState, useTransition } from "react";

import { sendReviewRequestNow } from "@/app/(app)/documents/actions";

/** Stuur handmatig een Google-review-verzoek naar de klant, met inline terugkoppeling. */
export function ReviewRequestButton({ contactId }: { contactId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);

  if (result?.ok) {
    return <span className="text-sm font-medium text-success">Review-verzoek verstuurd ✓</span>;
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Nu een review-verzoek naar de klant e-mailen?")) return;
          setResult(null);
          startTransition(async () => {
            setResult(await sendReviewRequestNow(contactId));
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
      >
        <Star className="size-4" />
        {pending ? "Versturen…" : "Vraag review"}
      </button>
      {result && !result.ok && <span className="text-xs text-danger">{result.error}</span>}
    </span>
  );
}
