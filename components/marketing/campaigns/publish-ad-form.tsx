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

import { generateAdTextAction, prepareRenderAction } from "@/app/(app)/marketing/campaigns/actions";
import { Card, Field, Input, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ApprovedSpec {
  id: string;
  label: string;
  format: string;
  locale: string;
}

/** Goedgekeurde carrouselset uit de AI-bouwer — in één klik over te nemen. */
interface CarouselSetOption {
  baseId: string;
  label: string;
  cardIds: string[];
  format: string;
  locale: string;
  /** AI-voorstel voor de advertentietekst (van de basis-spec). */
  message: string | null;
}

/** Busy-tekst van de AI-knop — ook de vergelijkingssleutel voor de knoplabel. */
const AI_BUSY = "De AI bekijkt je kaartjes en schrijft de tekst…";

/** Formaatuitleg: waar toont Meta dit — zodat de keuze niet technisch voelt. */
const FORMAT_LABEL: Record<string, string> = {
  "1080x1080": "1080×1080 · vierkant (feed + carrousel)",
  "1080x1350": "1080×1350 · staand (mobiele feed)",
  "1080x1920": "1080×1920 · story/reel",
};

export function PublishAdForm({
  adSetId,
  approvedSpecs,
  carouselSets = [],
}: {
  adSetId: string;
  approvedSpecs: ApprovedSpec[];
  carouselSets?: CarouselSetOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "carousel">("single");
  const [specId, setSpecId] = useState(approvedSpecs[0]?.id ?? "");
  /** Carrousel: aangevinkte specs, in aanvinkvolgorde (= kaartvolgorde). */
  const [carouselIds, setCarouselIds] = useState<string[]>([]);
  /** Carrouselfilters: vierkant is de standaard — dat toont Meta overal. */
  const [cardFormat, setCardFormat] = useState("1080x1080");
  const [cardLocale, setCardLocale] = useState("");
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

  const formats = [...new Set(approvedSpecs.map((s) => s.format))].sort();
  const locales = [...new Set(approvedSpecs.map((s) => s.locale))].sort();
  const visibleCards = approvedSpecs.filter(
    (s) =>
      (cardFormat === "" || s.format === cardFormat) &&
      (cardLocale === "" || s.locale === cardLocale),
  );

  /** "Schrijf met AI": advertentietekst + naamvoorstel uit de gekozen creatives. */
  async function generateMessage() {
    setError(null);
    setBusy(AI_BUSY);
    try {
      const ids = mode === "carousel" ? carouselIds : [specId];
      const result = await generateAdTextAction({ specIds: ids, link: link || null });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.message) setMessage(result.message);
      if (result.name && !name) setName(result.name);
    } catch {
      setError("De AI-aanvraag mislukte. Probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  }

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
          {specId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/creatives/render?id=${specId}`}
              alt="Voorbeeld van de gekozen creative"
              className="mt-2 max-h-48 rounded-md border border-border bg-background object-contain"
            />
          )}
        </Field>
      ) : (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">
            Kaartjes ({carouselIds.length} gekozen — klikvolgorde = kaartvolgorde)
          </legend>
          {carouselSets.length > 0 && (
            <div className="mb-2 space-y-1 rounded-md border border-accent/40 bg-accent/5 p-2">
              <p className="text-xs font-medium">
                Kant-en-klare carrouselsets (AI-bouwer) — één klik vult kaartjes, volgorde en tekst:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {carouselSets.map((set) => (
                  <button
                    key={set.baseId}
                    type="button"
                    onClick={() => {
                      setCarouselIds(set.cardIds);
                      setCardFormat(set.format);
                      setCardLocale(set.locale);
                      if (set.message && !message) setMessage(set.message);
                      if (!name) setName(set.label);
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-accent"
                  >
                    {set.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-2 flex flex-wrap gap-2">
            <select
              value={cardFormat}
              onChange={(e) => setCardFormat(e.target.value)}
              aria-label="Filter op formaat"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Alle formaten</option>
              {formats.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f] ?? f}
                </option>
              ))}
            </select>
            <select
              value={cardLocale}
              onChange={(e) => setCardLocale(e.target.value)}
              aria-label="Filter op taal"
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Alle talen</option>
              {locales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {visibleCards.length === 0 && (
            <p className="rounded-md border border-border p-3 text-sm text-muted">
              Geen goedgekeurde creatives in dit formaat/deze taal.
            </p>
          )}
          <ul className="grid max-h-96 list-none grid-cols-3 gap-2 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-4">
            {visibleCards.map((s) => {
              const idx = carouselIds.indexOf(s.id);
              const picked = idx >= 0;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => toggleCard(s.id)}
                    aria-pressed={picked}
                    aria-label={`${picked ? "Deselecteer" : "Selecteer"} ${s.label}`}
                    className={cn(
                      "relative block w-full overflow-hidden rounded-md border text-left transition-colors",
                      picked ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent/50",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/creatives/render?id=${s.id}`}
                      alt={s.label}
                      loading="lazy"
                      className="aspect-square w-full bg-background object-contain"
                    />
                    {picked && (
                      <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                    )}
                    <span className="block truncate px-1.5 py-1 text-[11px] text-muted" title={s.label}>
                      {s.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Elk kaartje krijgt zijn eigen kop en ondertitel uit de creative; kies dus varianten met
            hetzelfde formaat en dezelfde taal.
          </p>
          {(() => {
            const picked = approvedSpecs.filter((s) => carouselIds.includes(s.id));
            const mixedFormat = new Set(picked.map((s) => s.format)).size > 1;
            const mixedLocale = new Set(picked.map((s) => s.locale)).size > 1;
            if (!mixedFormat && !mixedLocale) return null;
            return (
              <p className="mt-1 text-xs font-medium text-amber-700" role="alert">
                ⚠ Je selectie mixt {mixedFormat ? "formaten" : ""}
                {mixedFormat && mixedLocale ? " én " : ""}
                {mixedLocale ? "talen" : ""} — de carrousel oogt dan rommelig. Kies bij voorkeur
                één formaat en één taal.
              </p>
            );
          })()}
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
        <button
          type="button"
          onClick={generateMessage}
          disabled={!!busy || (mode === "carousel" ? carouselIds.length < 2 : !specId)}
          className={buttonClass({ variant: "secondary", size: "sm", className: "mt-1" })}
        >
          ✨ {busy === AI_BUSY ? "AI schrijft…" : "Schrijf met AI (kijkt naar je kaartjes)"}
        </button>
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
