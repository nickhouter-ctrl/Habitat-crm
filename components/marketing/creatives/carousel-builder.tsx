"use client";

/**
 * AI-carrouselbouwer: kies 2–10 beelden uit de bibliotheek, laat de AI de
 * verhaalvolgorde en alle teksten schrijven (per kaart kop + subregel die op
 * elkaar doorlopen, plus de advertentietekst erboven), stel bij waar nodig en
 * maak de set als concepten aan. Goedkeuren gebeurt daarna gewoon via het
 * set-goedkeurblok op de Creatives-pagina — dezelfde poortwachter als altijd.
 */
import { ArrowDown, ArrowUp, Images, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  createCarouselSetAction,
  generateCarouselStoryAction,
} from "@/app/(app)/marketing/creatives/actions";
import { AssetPickerModal, type PickerAsset } from "@/components/marketing/creatives/asset-picker-modal";
import { Card, Field, Input, buttonClass } from "@/components/ui";
import type { CopyLimits, TemplateName } from "@/lib/creatives/templates";
import type { PaletteName } from "@/lib/creatives/tokens";
import { cn } from "@/lib/utils";

const LOCALE_LABEL: Record<string, string> = {
  nl: "Nederlands",
  en: "Engels",
  es: "Spaans",
  de: "Duits",
};

const ANGLE_LABEL: Record<string, string> = {
  "": "Geen (AI kiest zelf de toon)",
  material: "Materiaal — textuur en herkomst",
  price: "Prijs — laagdrempelige binnenkomer",
  showroom: "Showroom — kom zien en voelen",
  project: "Project — bewijs uit één hand",
  seasonal: "Seizoen — actuele aanleiding",
};

interface CardCopy {
  headline: string;
  subline: string;
}

export function CarouselBuilder({
  assets,
  templates,
  palettes,
  limitsByTemplate,
  aiEnabled,
}: {
  assets: PickerAsset[];
  templates: { name: TemplateName; label: string }[];
  palettes: PaletteName[];
  /** Tekenlimieten per sjabloon voor het vaste carrouselformaat 1080×1080. */
  limitsByTemplate: Record<TemplateName, CopyLimits>;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Geselecteerde beelden, in kaartvolgorde. */
  const [ids, setIds] = useState<string[]>([]);
  const [cards, setCards] = useState<Record<string, CardCopy>>({});
  const [locale, setLocale] = useState<"nl" | "en" | "es" | "de">("nl");
  const [angle, setAngle] = useState("");
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState<TemplateName>("frame");
  const [palette, setPalette] = useState<PaletteName>("creme");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storyDone, setStoryDone] = useState(false);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const limits = limitsByTemplate[template];

  const setCard = (id: string, patch: Partial<CardCopy>) =>
    setCards((prev) => {
      const current = prev[id] ?? { headline: "", subline: "" };
      return { ...prev, [id]: { ...current, ...patch } };
    });

  const move = (index: number, delta: -1 | 1) =>
    setIds((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) => setIds((prev) => prev.filter((x) => x !== id));

  const aiInput = () => ({
    assetIds: ids,
    locale,
    angle: angle || null,
    subject: subject || null,
    template,
    format: "1080x1080" as const,
  });

  async function generateStory() {
    setError(null);
    setBusy("De AI bekijkt je beelden en schrijft het verhaal…");
    try {
      const result = await generateCarouselStoryAction(aiInput());
      if (result.error || !result.story) {
        setError(result.error ?? "Het AI-verhaal mislukte. Probeer het opnieuw.");
        return;
      }
      const { orderedAssetIds, cards: storyCards, message: storyMessage, name: storyName } = result.story;
      setIds(orderedAssetIds);
      setCards(
        Object.fromEntries(
          orderedAssetIds.map((id, i) => [
            id,
            { headline: storyCards[i]?.headline ?? "", subline: storyCards[i]?.subline ?? "" },
          ]),
        ),
      );
      setMessage(storyMessage);
      if (!name) setName(storyName);
      setStoryDone(true);
    } catch {
      setError("De AI-aanvraag mislukte. Probeer het opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  async function createSet() {
    setError(null);
    const empty = ids.filter((id) => !(cards[id]?.headline ?? "").trim());
    if (empty.length > 0) {
      setError("Elke kaart heeft een kop nodig — laat de AI schrijven of vul ze zelf in.");
      return;
    }
    setBusy("Concepten aanmaken…");
    try {
      const result = await createCarouselSetAction({
        ...aiInput(),
        palette,
        message: message || null,
        cards: ids.map((id) => ({
          assetId: id,
          headline: cards[id].headline.trim(),
          subline: cards[id].subline.trim() || undefined,
        })),
      });
      if (result.error || !result.setId) {
        setError(result.error ?? "Aanmaken mislukte. Probeer het opnieuw.");
        return;
      }
      router.push(`/marketing/creatives?set=${result.setId}`);
    } catch {
      setError("Aanmaken mislukte. Controleer je netwerk en probeer opnieuw.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Taal" htmlFor="car-locale">
            <select
              id="car-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as typeof locale)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {Object.entries(LOCALE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Invalshoek" htmlFor="car-angle">
            <select
              id="car-angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {Object.entries(ANGLE_LABEL).map(([value, label]) => (
                <option key={value || "none"} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sjabloon (kaartopmaak)" htmlFor="car-template">
            <select
              id="car-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value as TemplateName)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {templates.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Palet" htmlFor="car-palette">
            <select
              id="car-palette"
              value={palette}
              onChange={(e) => setPalette(e.target.value as PaletteName)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {palettes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Onderwerp of thema (optioneel — geeft de AI richting)"
          htmlFor="car-subject"
        >
          <Input
            id="car-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={300}
            placeholder="bv. renovatie van een villa in Jávea, van ruwbouw tot oplevering"
          />
        </Field>
        <p className="text-xs text-muted">
          Formaat staat vast op 1080×1080 (vierkant) — dat toont Meta voor carrouselkaartjes op
          álle plekken, ook mobiel op Instagram en Facebook.
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Kaartjes ({ids.length}/10{ids.length < 2 ? " — kies er minstens 2" : ""})
          </h2>
          <button type="button" onClick={() => setPickerOpen(true)} className={buttonClass({ variant: "secondary" })}>
            <Images className="size-4" aria-hidden /> Kies beelden
          </button>
        </div>

        {ids.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
            Nog geen beelden gekozen. Kies 2–10 beelden — de AI bepaalt daarna de sterkste
            verhaalvolgorde en schrijft alle teksten.
          </p>
        ) : (
          <ol className="grid list-none gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ids.map((id, index) => {
              const asset = assetById.get(id);
              const copy = cards[id] ?? { headline: "", subline: "" };
              return (
                <li key={id}>
                  <div className="space-y-2 rounded-md border border-border p-2">
                    <div className="relative">
                      {asset?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={asset.url}
                          alt={asset.label}
                          className="aspect-square w-full rounded object-cover"
                        />
                      ) : (
                        <span className="flex aspect-square w-full items-center justify-center rounded bg-background text-xs text-muted">
                          geen opslag
                        </span>
                      )}
                      <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="absolute right-1.5 top-1.5 flex gap-1">
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          disabled={index === 0}
                          aria-label="Kaart naar voren"
                          className="rounded bg-background/85 p-1 disabled:opacity-40"
                        >
                          <ArrowUp className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          disabled={index === ids.length - 1}
                          aria-label="Kaart naar achteren"
                          className="rounded bg-background/85 p-1 disabled:opacity-40"
                        >
                          <ArrowDown className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(id)}
                          aria-label="Kaart verwijderen"
                          className="rounded bg-background/85 p-1"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    </div>
                    <Field
                      label={`Kop (${copy.headline.length}/${limits.headline})`}
                      htmlFor={`card-h-${id}`}
                    >
                      <Input
                        id={`card-h-${id}`}
                        value={copy.headline}
                        onChange={(e) => setCard(id, { headline: e.target.value })}
                        maxLength={Math.floor(limits.headline / 0.78)}
                        className={cn(copy.headline.length > limits.headline && "border-amber-500")}
                      />
                    </Field>
                    <Field
                      label={`Subregel (${copy.subline.length}/${limits.subline})`}
                      htmlFor={`card-s-${id}`}
                    >
                      <Input
                        id={`card-s-${id}`}
                        value={copy.subline}
                        onChange={(e) => setCard(id, { subline: e.target.value })}
                        maxLength={limits.subline}
                      />
                    </Field>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {ids.length >= 2 && (
          <button
            type="button"
            onClick={generateStory}
            disabled={!!busy || !aiEnabled}
            className={buttonClass({ variant: storyDone ? "secondary" : "primary" })}
            title={aiEnabled ? undefined : "AI is niet beschikbaar (geen ANTHROPIC_API_KEY)"}
          >
            <Sparkles className="size-4" aria-hidden />
            {storyDone ? "Laat AI een nieuw verhaal schrijven" : "Laat AI het verhaal schrijven"}
          </button>
        )}
      </Card>

      {(storyDone || message) && (
        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Advertentietekst en naam</h2>
          <Field label={`Advertentietekst boven de carrousel (${message.length}/500)`} htmlFor="car-message">
            <textarea
              id="car-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
            />
          </Field>
          <Field label="Interne naam" htmlFor="car-name">
            <Input
              id="car-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
          </Field>
        </Card>
      )}

      <div aria-live="polite" className="space-y-2">
        {busy && <p className="text-sm text-muted">{busy}</p>}
        {error && (
          <Card className="border-red-300 bg-red-50 p-3 text-sm" role="alert">
            {error}
          </Card>
        )}
      </div>

      <button
        type="button"
        onClick={createSet}
        disabled={!!busy || ids.length < 2}
        className={buttonClass()}
      >
        Maak {ids.length >= 2 ? `${ids.length} kaartconcepten` : "concepten"} aan
      </button>
      <p className="text-xs text-muted">
        De kaartjes worden als concepten aangemaakt; daarna keur je ze op de Creatives-pagina in
        één keer goed en publiceer je de carrousel gepauzeerd via een campagne.
      </p>

      <AssetPickerModal
        open={pickerOpen}
        assets={assets}
        selected={ids}
        onClose={() => setPickerOpen(false)}
        onConfirm={(picked) => {
          setIds(picked.slice(0, 10));
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
