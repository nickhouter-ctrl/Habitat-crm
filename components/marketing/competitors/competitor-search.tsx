"use client";

/**
 * Concurrent zoeken op naam in het EU-advertentiearchief (U8). Twee smaken:
 *
 *  - zonder `competitorId`: los zoekveld — een treffer volgen maakt (of
 *    completeert) een concurrent, page-id automatisch ingevuld;
 *  - met `competitorId`: "Zoek page-ID" voor een prospect — een treffer
 *    koppelt het id aan die bestaande rij.
 *
 * Zonder Ad Library-token blijft het veld uitgeschakeld met uitleg (de
 * server geeft dezelfde uitleg als iemand het toch probeert).
 */
import { Search } from "lucide-react";
import { useState, useTransition } from "react";

import { Button, Input } from "@/components/ui";
import {
  followPageAction,
  setPageIdAction,
} from "@/app/(app)/marketing/competitors/actions";

interface PageHit {
  pageId: string;
  pageName: string;
  adCount: number;
}

export function CompetitorSearch({
  hasToken,
  competitorId,
  prefill,
}: {
  /** Is META_ADS_ARCHIVE_TOKEN geconfigureerd? Zonder token: uitgelegd uit. */
  hasToken: boolean;
  /** Bestaande prospect om een page-id aan te koppelen; leeg = nieuw volgen. */
  competitorId?: string;
  prefill?: string;
}) {
  const [query, setQuery] = useState(prefill ?? "");
  const [hits, setHits] = useState<PageHit[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  async function search() {
    if (query.trim().length < 3) {
      setMessage("Gebruik een zoekterm van minstens 3 tekens.");
      return;
    }
    setSearching(true);
    setMessage(null);
    setHits(null);
    try {
      const res = await fetch(`/api/competitors/search?q=${encodeURIComponent(query.trim())}`);
      const body = (await res.json().catch(() => ({}))) as { hits?: PageHit[]; error?: string };
      if (body.error) {
        setMessage(body.error);
      } else if (!body.hits || body.hits.length === 0) {
        setMessage(
          "Geen adverterende pagina's gevonden voor deze naam. Probeer een kortere of Spaanse variant — alleen pagina's die (recent) in Spanje adverteerden staan in het archief.",
        );
      } else {
        setHits(body.hits);
      }
    } catch {
      setMessage("Netwerkfout bij het zoeken — probeer het opnieuw.");
    } finally {
      setSearching(false);
    }
  }

  function pick(hit: PageHit) {
    startTransition(async () => {
      const form = new FormData();
      let error: string | null;
      if (competitorId) {
        form.set("id", competitorId);
        form.set("pageId", hit.pageId);
        error = await setPageIdAction(form);
      } else {
        form.set("name", hit.pageName);
        form.set("pageId", hit.pageId);
        error = await followPageAction(form);
      }
      setMessage(error ?? `"${hit.pageName}" gekoppeld — de wekelijkse sync pakt hem mee.`);
      if (!error) setHits(null);
    });
  }

  if (!hasToken) {
    return (
      <p className="text-xs text-muted">
        Zoeken op naam vereist een Ad Library-token (META_ADS_ARCHIVE_TOKEN, zie .env.example).
        Tot die tijd kan een page-id alleen handmatig gekoppeld worden.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label className="sr-only" htmlFor={`competitor-search-${competitorId ?? "new"}`}>
          Concurrent zoeken op naam
        </label>
        <Input
          id={`competitor-search-${competitorId ?? "new"}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Concurrent zoeken op naam, bv. Azulejos Jávea"
          className="w-72"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={searching || pending}>
          <Search className="mr-1.5 size-3.5" aria-hidden />
          {searching ? "Zoeken…" : competitorId ? "Zoek page-ID" : "Zoeken"}
        </Button>
      </form>

      {hits && (
        <ul className="divide-y divide-border/60 rounded-md border border-border text-sm">
          {hits.map((hit) => (
            <li key={hit.pageId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{hit.pageName}</span>{" "}
                <span className="text-xs text-muted">
                  · page-id {hit.pageId} · {hit.adCount}{" "}
                  {hit.adCount === 1 ? "advertentie" : "advertenties"} in het archief
                </span>
              </span>
              <Button type="button" size="sm" disabled={pending} onClick={() => pick(hit)}>
                {competitorId ? "Koppelen" : "Volgen"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p aria-live="polite" className="text-xs text-muted">
        {message}
      </p>
    </div>
  );
}
