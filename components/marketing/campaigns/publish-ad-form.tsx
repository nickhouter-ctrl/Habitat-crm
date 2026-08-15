"use client";

/**
 * Publiceer een goedgekeurde creative als GEPAUZEERDE Meta-advertentie
 * (brief §3.4/§7). Twee vormen: één beeld, of een carrousel van 2–10
 * goedgekeurde creatives (meerdere beelden in één advertentie, elk kaartje
 * met eigen kop uit de spec-copy). Twee stappen achter één knop: eerst de
 * render(s) vastleggen (spec-hash-hergebruik), daarna de publicatieketen via
 * /api/meta/publish. Elke fout blijft zichtbaar in het formulier mét wat de
 * gebruiker nu moet doen — niet alleen in een log (§7).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { prepareRenderAction } from "@/app/(app)/marketing/campaigns/actions";
import { Card, Field, Input, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ApprovedSpec {
  id: string;
  label: string;
}

export function PublishAdForm({
  adSetId,
  approvedSpecs,
}: {
  adSetId: string;
  approvedSpecs: ApprovedSpec[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "carousel">("single");
  const [specId, setSpecId] = useState(approvedSpecs[0]?.id ?? "");
  /** Carrousel: aangevinkte specs, in aanvinkvolgorde (= kaartvolgorde). */
  const [carouselIds, setCarouselIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("https://habitat-one.com/");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (approvedSpecs.length === 0) {
    return (
      <p className="text-sm text-muted">
        Er zijn nog geen goedgekeurde creatives. Keur eerst een creative goed onder{" "}
        <Link href="/marketing/creatives" className="text-accent underline">
          Creatives
        </Link>
        .
      </p>
    );
  }

  const toggleCard = (id: string) =>
    setCarouselIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);

    const ids = mode === "carousel" ? carouselIds : [specId];
    if (mode === "carousel" && (ids.length < 2 || ids.length > 10)) {
      setError("Een carrousel heeft 2 t/m 10 kaartjes nodig — vink de creatives aan in de gewenste volgorde.");
      return;
    }

    for (let i = 0; i < ids.length; i++) {
      setBusy(ids.length > 1 ? `Render vastleggen (${i + 1}/${ids.length})…` : "Render vastleggen…");
      const prep = await prepareRenderAction(ids[i]);
      if (prep.error) {
        setError(prep.error);
        setBusy(null);
        return;
      }
    }

    setBusy("Publiceren naar Meta (gepauzeerd)…");
    try {
      const res = await fetch("/api/meta/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "carousel"
            ? { specIds: ids, adSetId, name, message, link }
            : { specId, adSetId, name, message, link },
        ),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(
          body.error ??
            "Publiceren is mislukt. Probeer het opnieuw; blijft dit gebeuren, controleer dan het Meta-token en het advertentie-account.",
        );
      } else {
        setDone(
          "Advertentie GEPAUZEERD aangemaakt in Meta. Activeren doe je bewust in Ads Manager (§3.4).",
        );
        setName("");
        setMessage("");
        setCarouselIds([]);
        router.refresh();
      }
    } catch {
      setError("Geen verbinding met de server. Controleer je netwerk en probeer opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={publish} className="space-y-3">
      <div className="flex gap-1" role="tablist" aria-label="Advertentievorm">
        {(
          [
            ["single", "Eén beeld"],
            ["carousel", "Carrousel (2–10 beelden)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              mode === value
                ? "bg-accent/10 font-medium text-accent"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <Field label="Goedgekeurde creative" htmlFor={`pub-spec-${adSetId}`}>
          <select
            id={`pub-spec-${adSetId}`}
            value={specId}
            onChange={(e) => setSpecId(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
          >
            {approvedSpecs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            Kaartjes ({carouselIds.length} gekozen — aanvinkvolgorde = kaartvolgorde)
          </legend>
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {approvedSpecs.map((s) => {
              const idx = carouselIds.indexOf(s.id);
              return (
                <li key={s.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={idx >= 0}
                      onChange={() => toggleCard(s.id)}
                      className="size-4"
                    />
                    {idx >= 0 && (
                      <span className="rounded bg-accent/10 px-1.5 text-xs font-medium text-accent">
                        {idx + 1}
                      </span>
                    )}
                    {s.label}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Elk kaartje krijgt zijn eigen kop en ondertitel uit de creative; kies dus varianten met
            hetzelfde formaat en dezelfde taal.
          </p>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Advertentienaam" htmlFor={`pub-name-${adSetId}`}>
          <Input
            id={`pub-name-${adSetId}`}
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bv. FlexStone ES vierkant prijs-hoek"
          />
        </Field>
        <Field label="Landingspagina" htmlFor={`pub-link-${adSetId}`}>
          <Input
            id={`pub-link-${adSetId}`}
            required
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Advertentietekst (message)" htmlFor={`pub-msg-${adSetId}`}>
        <textarea
          id={`pub-msg-${adSetId}`}
          required
          maxLength={2000}
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      </Field>

      <div aria-live="polite" className="space-y-2">
        {busy && <p className="text-sm text-muted">{busy}</p>}
        {error && (
          <Card className="border-red-300 bg-red-50 p-3 text-sm" role="alert">
            {error}
          </Card>
        )}
        {done && (
          <Card className="border-green-300 bg-green-50 p-3 text-sm" role="status">
            {done}
          </Card>
        )}
      </div>

      <button type="submit" disabled={!!busy} className={buttonClass()}>
        {busy ?? (mode === "carousel" ? "Publiceer carrousel gepauzeerd naar Meta" : "Publiceer gepauzeerd naar Meta")}
      </button>
    </form>
  );
}
