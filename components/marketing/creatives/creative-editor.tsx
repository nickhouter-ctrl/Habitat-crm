"use client";

/**
 * Creative-editor (brief §7): asset, sjabloon, formaat, palet en taal kiezen;
 * copy prefilled vanuit de tekstblokken per product + hoek; live preview via
 * hetzelfde render-endpoint als de export (§2: geen tweede rendermotor);
 * tellers die kleuren bij overschrijding (§6b).
 *
 * "Maak set" genereert 3 formaten × 4 talen als aparte specs — twaalf
 * bestanden uit één handeling, de belangrijkste tijdwinst van de module.
 */
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  createCreativeSet,
  createCreativeSpec,
  generateAiCopyAction,
  type EditorActionState,
} from "@/app/(app)/marketing/creatives/actions";
import { Badge, Card, Field, Input, Label, buttonClass } from "@/components/ui";
import type { CreativeSpec } from "@/lib/creatives/schema";
import { TEMPLATES, TEMPLATE_NAMES, type TemplateName } from "@/lib/creatives/templates";
import {
  FORMATS,
  FORMAT_NAMES,
  PALETTES,
  PALETTE_NAMES,
  type FormatName,
  type PaletteName,
} from "@/lib/creatives/tokens";
import { shrinkScaleFor, validateSpecCopy } from "@/lib/creatives/validate";
import {
  getCopySuggestion,
  type CopyBlockLike,
} from "@/lib/marketing/copy-suggest";
import { subcategoryForFamily, TAXONOMY } from "@/lib/marketing/taxonomy";
import { cn } from "@/lib/utils";
import { AssetPickerModal, type PickerAsset } from "./asset-picker-modal";

/* -------------------------------------------------------------------- types */

export type CreativeLocale = "nl" | "en" | "es" | "de";

/** Asset zoals de editor én de popup-kiezer (U6) hem nodig hebben. */
export type EditorAsset = PickerAsset;

export interface EditorProduct {
  id: string;
  name: string;
  category: string | null;
  /** Vanafprijs als db-`numeric`-string; tokens in copyblokken gebruiken hem. */
  priceFromEur: string | null;
  specs: Record<string, string | number> | null;
}

/** Best presterende combinatie uit de leerlaag (brief §8) — vooringevuld,
 *  altijd overschrijfbaar. */
export interface EditorSuggestionProp {
  template?: string;
  palette?: string;
  copyAngle?: string;
  reason: string;
}

export interface EditorInitial {
  assetId?: string;
  productId?: string | null;
  category?: string | null;
  template?: TemplateName;
  palette?: PaletteName;
  format?: FormatName;
  locale?: CreativeLocale;
  copyAngle?: string | null;
  copy?: Partial<Record<CopyField, string>>;
  parentId?: string | null;
}

type CopyField = "eyebrow" | "headline" | "subline" | "cta" | "badge";

const COPY_FIELDS: Array<{ key: CopyField; label: string; multiline?: boolean }> = [
  { key: "eyebrow", label: "Bovenregel" },
  { key: "headline", label: "Kop", multiline: true },
  { key: "subline", label: "Subregel", multiline: true },
  { key: "cta", label: "Knoptekst" },
  { key: "badge", label: "Badge (bv. prijs)" },
];

const LOCALE_LABELS: Record<CreativeLocale, string> = {
  nl: "Nederlands",
  en: "Engels",
  es: "Spaans",
  de: "Duits",
};

const ANGLE_LABELS: Record<string, string> = {
  material: "Materiaal",
  price: "Prijs",
  showroom: "Showroom",
  project: "Project",
  seasonal: "Seizoen",
};

/** base64url voor de preview-URL — de spec reist mee in de querystring. */
function b64url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ------------------------------------------------------------------- editor */

export function CreativeEditor({
  assets,
  products,
  copyBlocks,
  initial,
  suggestion,
  aiEnabled,
}: {
  assets: EditorAsset[];
  products: EditorProduct[];
  copyBlocks: CopyBlockLike[];
  initial: EditorInitial;
  /** Best presterende combinatie uit de leerlaag; null zonder data. */
  suggestion?: EditorSuggestionProp | null;
  /** Is er een ANTHROPIC_API_KEY? Zo niet, geen AI-knop. */
  aiEnabled?: boolean;
}) {
  // Multi-select (U6): het eerste beeld stuurt de preview en het losse concept;
  // "Maak set" genereert per gekozen beeld × formaat × taal.
  const [assetIds, setAssetIds] = useState<string[]>(
    initial.assetId ? [initial.assetId] : [],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productId, setProductId] = useState(initial.productId ?? "");
  const [category, setCategory] = useState(initial.category ?? "");
  // Leerlaag-suggestie als default — alleen als er geen expliciete beginstand
  // is (dupliceren wint), en alleen met waarden die de registry kent.
  const [template, setTemplate] = useState<TemplateName>(
    initial.template ??
      (TEMPLATE_NAMES.find((t) => t === suggestion?.template) ?? "frame"),
  );
  const [format, setFormat] = useState<FormatName>(initial.format ?? "1080x1080");
  const [palette, setPalette] = useState<PaletteName>(
    initial.palette ??
      (PALETTE_NAMES.find((p) => p === suggestion?.palette) ?? "diep"),
  );
  const [locale, setLocale] = useState<CreativeLocale>(initial.locale ?? "es");
  const [angle, setAngle] = useState(initial.copyAngle ?? suggestion?.copyAngle ?? "");
  const [variant, setVariant] = useState(0);
  const [copy, setCopy] = useState<Record<CopyField, string>>({
    eyebrow: initial.copy?.eyebrow ?? "",
    headline: initial.copy?.headline ?? "",
    subline: initial.copy?.subline ?? "",
    cta: initial.copy?.cta ?? "",
    badge: initial.copy?.badge ?? "",
  });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Velden die de gebruiker zelf aanraakte, overschrijft prefill nooit.
  const dirtyRef = useRef(new Set<CopyField>(
    (Object.keys(initial.copy ?? {}) as CopyField[]).filter((k) => initial.copy?.[k]),
  ));

  const asset = assets.find((a) => a.id === assetIds[0]) ?? null;
  const selectedAssets = assetIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is EditorAsset => !!a);
  const setSize = assetIds.length * FORMAT_NAMES.length * 4; // beelden × formaten × talen
  const product = products.find((p) => p.id === productId) ?? null;
  const limits = TEMPLATES[template].limits[format];

  /** Vul velden vanuit de copyblokken; force = ook aangeraakte velden. */
  const applySuggestion = (force: boolean, nextVariant = variant) => {
    if (!angle) return;
    const prefill = angle
      ? getCopySuggestion(copyBlocks, {
          angle: angle as CopyBlockLike["angle"],
          locale,
          productId: productId || null,
          priceFrom: product?.priceFromEur ?? null,
          finish: (product?.specs?.finish as string | undefined) ?? null,
          category: category || product?.category || null,
          variant: nextVariant,
        })
      : {};
    setCopy((prev) => {
      const next = { ...prev };
      for (const key of ["eyebrow", "headline", "subline", "cta"] as const) {
        if (prefill[key] && (force || !dirtyRef.current.has(key))) {
          next[key] = prefill[key]!;
          if (force) dirtyRef.current.delete(key);
        }
      }
      return next;
    });
  };

  /* Prefill bij wisselen van taal, hoek, product of categorie — alleen
     niet-aangeraakte velden (U2: automatisch invullen bij wissel). */
  useEffect(() => {
    applySuggestion(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill alleen bij deze triggers
  }, [locale, angle, productId, category]);

  /* Payload voor acties + preview. */
  const spec = useMemo(
    () => ({
      template,
      palette,
      format,
      locale,
      copy: {
        eyebrow: copy.eyebrow || undefined,
        headline: copy.headline,
        subline: copy.subline || undefined,
        cta: copy.cta || undefined,
        badge: copy.badge || undefined,
      },
      copyAngle: angle || null,
      productId: productId || null,
      category: category || product?.category || null,
      assetId: assetIds[0] ?? null,
      assetIds,
      parentId: initial.parentId ?? null,
    }),
    [template, palette, format, locale, copy, angle, productId, category, product?.category, assetIds, initial.parentId],
  );

  /** "Genereer met AI" (U3) — schrijft alle velden; fout blijft inline zichtbaar. */
  const generateWithAi = async () => {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await generateAiCopyAction({
        locale,
        angle: angle || null,
        productId: productId || null,
        category: category || product?.category || null,
        template,
        format,
        assetId: assetIds[0] ?? null,
      });
      if (result.error) {
        setAiError(result.error);
      } else if (result.copy) {
        setCopy((prev) => {
          const next = { ...prev };
          for (const key of ["eyebrow", "headline", "subline", "cta", "badge"] as const) {
            if (result.copy![key]) {
              next[key] = result.copy![key]!;
              dirtyRef.current.add(key); // bewust gegenereerd = eigen inhoud
            }
          }
          return next;
        });
      }
    } catch {
      setAiError("De AI-aanvraag mislukte. Probeer het opnieuw.");
    } finally {
      setAiBusy(false);
    }
  };

  /* Live validatie (dezelfde functie als de approve-poortwachter). */
  const issues = useMemo(
    () =>
      copy.headline
        ? validateSpecCopy({ ...spec, copy: { ...spec.copy, headline: copy.headline } } as CreativeSpec)
        : [],
    [spec, copy.headline],
  );
  const headlineScale = shrinkScaleFor(copy.headline.length, limits.headline);
  const sublineScale = copy.subline ? shrinkScaleFor(copy.subline.length, limits.subline) : 1;

  /* Debounced preview via het render-endpoint als <img src> (§6). De doel-URL
     is afgeleide staat; alleen de vertraagde overname ervan is echte state. */
  const assetUrl = asset?.url ?? null;
  const headlineFilled = copy.headline.length > 0;
  const targetPreviewUrl = useMemo(() => {
    if (!assetUrl || !headlineFilled) return null;
    const renderable = { ...spec, assetUrl };
    return `/api/creatives/render?spec=${b64url(JSON.stringify(renderable))}`;
  }, [spec, assetUrl, headlineFilled]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!targetPreviewUrl) return;
    const handle = setTimeout(() => setPreviewUrl(targetPreviewUrl), 450);
    return () => clearTimeout(handle);
  }, [targetPreviewUrl]);
  const shownPreviewUrl = targetPreviewUrl ? previewUrl : null;
  const previewStale = shownPreviewUrl !== targetPreviewUrl;

  const [saveState, saveAction, savePending] = useActionState<EditorActionState, FormData>(
    createCreativeSpec,
    {},
  );
  const [setState, setActionFn, setPending] = useActionState<EditorActionState, FormData>(
    createCreativeSet,
    {},
  );
  const actionState: EditorActionState = saveState.error ? saveState : setState;
  const pending = savePending || setPending;

  const formatMeta = FORMATS[format];

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <input type="hidden" name="payload" value={JSON.stringify(spec)} />

      <div className="space-y-5">
        {/* ------------------------------------------------- beeld(en) (U6) */}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-3">
            <Label>
              Beeld{assetIds.length > 1 ? `en (${assetIds.length})` : ""}
            </Label>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={assets.length === 0}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Kies beeld(en)
            </button>
          </div>
          {assets.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              De bibliotheek is leeg — vul hem eerst via{" "}
              <Link href="/marketing/assets" className="text-accent underline">
                Beeldbibliotheek
              </Link>
              .
            </p>
          ) : selectedAssets.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              Nog geen beeld gekozen. Het eerste gekozen beeld stuurt de preview; met meerdere
              beelden maakt &ldquo;Maak set&rdquo; een set per beeld.
            </p>
          ) : (
            <ul className="mt-2 flex list-none gap-2 overflow-x-auto pb-1" aria-label="Gekozen beelden">
              {selectedAssets.map((a, i) => (
                <li key={a.id} className="relative shrink-0">
                  <span
                    className={cn(
                      "block overflow-hidden rounded-md border-2",
                      i === 0 ? "border-accent" : "border-border",
                    )}
                    title={i === 0 ? `${a.label} (preview-beeld)` : a.label}
                  >
                    {a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.label} className="size-20 object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-20 items-center justify-center text-[10px] text-muted">
                        geen opslag
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAssetIds((prev) => prev.filter((id) => id !== a.id))}
                    aria-label={`Verwijder ${a.label} uit de selectie`}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-surface text-muted shadow-sm hover:text-foreground"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <AssetPickerModal
          open={pickerOpen}
          assets={assets}
          selected={assetIds}
          onClose={() => setPickerOpen(false)}
          onConfirm={(ids) => {
            setAssetIds(ids);
            setPickerOpen(false);
          }}
        />

        {/* ------------------------- product / categorie / hoek / taal (U2) */}
        <Card className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Product (optioneel)" htmlFor="ce-product">
            <select
              id="ce-product"
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                const p = products.find((x) => x.id === e.target.value);
                // products.category is een familie ("Age Stone"); de picker
                // werkt in de menutaxonomie — vertaal bij het meebewegen.
                if (p?.category) setCategory(subcategoryForFamily(p.category));
              }}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Geen product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Categorie"
            htmlFor="ce-category"
            hint="Categorie volstaat voor prefill — een product is niet verplicht."
          >
            <select
              id="ce-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Geen categorie</option>
              {TAXONOMY.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.subcategories.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Invalshoek" htmlFor="ce-angle" hint="Bepaalt welke tekstblokken voorinvullen.">
            <select
              id="ce-angle"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Geen hoek</option>
              {Object.entries(ANGLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taal" htmlFor="ce-locale">
            <select
              id="ce-locale"
              value={locale}
              onChange={(e) => setLocale(e.target.value as CreativeLocale)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {Object.entries(LOCALE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        {/* -------------------------------------- sjabloon / formaat / palet */}
        <Card className="space-y-4 p-4">
          {suggestion && (
            <p className="rounded-md bg-accent/5 px-3 py-2 text-xs text-muted">
              <Sparkles className="mr-1 inline size-3.5 text-accent" aria-hidden />
              {suggestion.reason}
            </p>
          )}
          <fieldset>
            <legend className="text-sm font-medium">Sjabloon</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATE_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setTemplate(name)}
                  aria-pressed={template === name}
                  title={TEMPLATES[name].label}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm capitalize transition-colors",
                    template === name
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Formaat</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {FORMAT_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setFormat(name)}
                  aria-pressed={format === name}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    format === name
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-border text-muted hover:text-foreground",
                  )}
                >
                  {FORMATS[name].label} ({name})
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Palet</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PALETTE_NAMES.map((name) => {
                const p = PALETTES[name];
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPalette(name)}
                    aria-pressed={palette === name}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm capitalize transition-colors",
                      palette === name
                        ? "border-accent bg-accent/10 font-medium text-accent"
                        : "border-border text-muted hover:text-foreground",
                    )}
                  >
                    <span className="flex gap-0.5" aria-hidden>
                      {[p.ground, p.accent, p.ink].map((c, i) => (
                        <span
                          key={i}
                          className="size-3 rounded-full border border-black/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    {name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Card>

        {/* --------------------------------------------------------- teksten */}
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applySuggestion(true)}
              disabled={!angle}
              title={angle ? undefined : "Kies eerst een invalshoek"}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              Vul automatisch
            </button>
            <button
              type="button"
              onClick={() => {
                const next = variant + 1;
                setVariant(next);
                applySuggestion(true, next);
              }}
              disabled={!angle}
              className={buttonClass({ variant: "ghost", size: "sm" })}
              title="Volgend tekstblok uit dezelfde invalshoek"
            >
              Andere variant
            </button>
            {aiEnabled && (
              <button
                type="button"
                onClick={generateWithAi}
                disabled={aiBusy}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                <Sparkles className="size-3.5" aria-hidden />
                {aiBusy ? "Genereren…" : "Genereer met AI"}
              </button>
            )}
            <span className="text-xs text-muted">
              Vult vanuit de vastgelegde tekstblokken{aiEnabled ? " of laat AI schrijven" : ""} —
              alles blijft aanpasbaar.
            </span>
          </div>
          {aiError && (
            <Card className="border-amber-300 bg-amber-50 p-3 text-sm" role="alert">
              {aiError}
            </Card>
          )}
          {COPY_FIELDS.map(({ key, label, multiline }) => (
            <CopyInput
              key={key}
              id={`ce-${key}`}
              label={label}
              value={copy[key]}
              limit={limits[key]}
              required={key === "headline"}
              multiline={multiline}
              shrinkScale={
                key === "headline" ? headlineScale : key === "subline" ? sublineScale : undefined
              }
              onChange={(value) => {
                dirtyRef.current.add(key);
                setCopy((prev) => ({ ...prev, [key]: value }));
              }}
            />
          ))}
        </Card>

        {/* ----------------------------------------------- meldingen + acties */}
        <div aria-live="polite" className="space-y-2">
          {issues.length > 0 && (
            <Card className="border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Deze spec past nog niet binnen de layoutgaranties:</p>
              <ul className="mt-1 list-disc pl-5">
                {issues.map((issue) => (
                  <li key={issue.role}>{issue.message}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted">
                Opslaan als concept kan wél; goedkeuren pas als alles past.
              </p>
            </Card>
          )}
          {actionState.error && (
            <Card className="border-red-300 bg-red-50 p-3 text-sm" role="alert">
              <p className="font-medium">{actionState.error}</p>
              {actionState.fieldErrors && (
                <ul className="mt-1 list-disc pl-5">
                  {Object.entries(actionState.fieldErrors).map(([field, errors]) => (
                    <li key={field}>
                      {field}: {errors.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            formAction={saveAction}
            disabled={pending || assetIds.length === 0 || !copy.headline}
            className={buttonClass({ variant: "secondary" })}
            title={assetIds.length > 1 ? "Slaat één concept op met het eerste (preview-)beeld" : undefined}
          >
            {savePending ? "Opslaan…" : "Opslaan als concept"}
          </button>
          <button
            type="submit"
            formAction={setActionFn}
            disabled={pending || assetIds.length === 0 || !copy.headline}
            className={buttonClass()}
            title={`${assetIds.length || 1} beeld(en) × ${FORMAT_NAMES.length} formaten × 4 talen als aparte concepten`}
          >
            {setPending ? "Set maken…" : `Maak set (${setSize || 12} concepten)`}
          </button>
          {(assetIds.length === 0 || !copy.headline) && (
            <p className="text-xs text-muted">Kies minstens één beeld en vul een kop in.</p>
          )}
          {!angle && assetIds.length > 0 && !!copy.headline && (
            <p className="text-xs font-medium text-amber-700" role="status">
              ⚠ Geen invalshoek gekozen — &ldquo;Maak set&rdquo; geeft alle vier de talen dan
              deze zelfde tekst. Kies een invalshoek om per taal de juiste tekstblokken te
              gebruiken.
            </p>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------- preview */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <Label>Live preview</Label>
            <Badge tone="neutral">
              {formatMeta.label} · {format}
            </Badge>
          </div>
          <div
            className="relative w-full overflow-hidden rounded-md border bg-background"
            style={{ aspectRatio: `${formatMeta.width} / ${formatMeta.height}` }}
          >
            {shownPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shownPreviewUrl}
                alt={`Preview van de creative: ${copy.headline}`}
                className={cn("size-full object-contain transition-opacity", previewStale && "opacity-60")}
              />
            ) : (
              <p className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
                {asset?.url
                  ? "Vul een kop in voor de preview."
                  : "Kies een beeld voor de preview."}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            De preview komt uit exact hetzelfde endpoint als de export — wat je ziet is wat er
            naar Meta gaat.
          </p>
        </Card>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- copy-input */

/**
 * Tekstveld met teller die kleurt bij overschrijding (§6b). Voor kop en
 * subregel (U10) toont hij bovendien de automatische verkleiningsstap
 * (88%/78%) vóórdat het echt niet meer past.
 */
function CopyInput({
  id,
  label,
  value,
  limit,
  required,
  multiline,
  shrinkScale,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  limit: number;
  required?: boolean;
  multiline?: boolean;
  /** Alleen gezet voor verkleinbare rollen (kop, subregel). */
  shrinkScale?: 1 | 0.88 | 0.78 | null;
  onChange: (value: string) => void;
}) {
  const len = value.length;
  const shrinkable = shrinkScale !== undefined;
  const hardLimit = shrinkable ? Math.floor(limit / 0.78) : limit;
  const over = len > hardLimit;
  const shrinks = shrinkable && !over && len > limit;

  const counterClass = over
    ? "text-danger font-medium"
    : shrinks
      ? "text-warning font-medium"
      : "text-muted";

  const sharedProps = {
    id,
    value,
    required,
    "aria-describedby": `${id}-teller`,
    "aria-invalid": over || undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span id={`${id}-teller`} className={cn("text-xs tabular-nums", counterClass)} aria-live="polite">
          {len}/{shrinkable ? limit : hardLimit}
          {shrinks && ` — wordt verkleind naar ${Math.round((shrinkScale ?? 0.78) * 100)}%`}
          {over && " — past niet, ook niet verkleind"}
        </span>
      </div>
      {multiline ? (
        <textarea
          {...sharedProps}
          rows={2}
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
        />
      ) : (
        <Input {...sharedProps} />
      )}
    </div>
  );
}
