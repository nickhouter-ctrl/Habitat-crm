"use client";

import { useState, useTransition } from "react";

import { buttonClass } from "@/components/ui";
import { matchVariant, searchProducts } from "../actions";

type Hit = {
  id: string;
  name: string;
  sku: string | null;
  collection: string | null;
  category: string | null;
};

/** Handmatig een bestaand product zoeken en aan deze variant koppelen. */
export function MatchSearch({ variantId }: { variantId: string }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function run(q: string) {
    setTerm(q);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    start(async () => {
      const res = await searchProducts(q);
      setHits(res as Hit[]);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted underline hover:text-foreground"
      >
        Handmatig zoeken…
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <input
        autoFocus
        value={term}
        onChange={(e) => run(e.target.value)}
        placeholder="Zoek bestaand product (naam of SKU)…"
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
      />
      {pending && <p className="text-xs text-muted">Zoeken…</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-xs">
                {h.name}{" "}
                <span className="font-mono text-muted">{h.sku}</span>
                {h.collection ? <span className="text-muted"> · {h.collection}</span> : null}
              </span>
              <form action={matchVariant}>
                <input type="hidden" name="variantId" value={variantId} />
                <input type="hidden" name="productId" value={h.id} />
                <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
                  Koppel
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
