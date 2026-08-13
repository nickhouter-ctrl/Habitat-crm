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
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import {
  createCreativeSet,
  createCreativeSpec,
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
import { headlineScaleFor, validateSpecCopy } from "@/lib/creatives/validate";
import { cn } from "@/lib/utils";
import {
  resolveCopyPrefill,
  type CopyBlockRow,
  type CreativeLocale,
  type ProductTokens,
} from "./prefill";

/* -------------------------------------------------------------------- types */

export interface EditorAsset {
  id: string;
  url: string | null;
  label: string;
  productId: string | null;
}

export interface EditorProduct extends ProductTokens {
  id: string;
  name: string;
  category: string | null;
}

export interface EditorInitial {
  assetId?: string;
  productId?: string | null;
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
}: {
  assets: EditorAsset[];
  products: EditorProduct[];
  copyBlocks: CopyBlockRow[];
  initial: EditorInitial;
}) {
  const [assetId, setAssetId] = useState(initial.assetId ?? "");
  const [productId, setProductId] = useState(initial.productId ?? "");
  const [template, setTemplate] = useState<TemplateName>(initial.template ?? "frame");
  const [format, setFormat] = useState<FormatName>(initial.format ?? "1080x1080");
  const [palette, setPalette] = useState<PaletteName>(initial.palette ?? "diep");
  const [locale, setLocale] = useState<CreativeLocale>(initial.locale ?? "es");
  const [angle, setAngle] = useState(initial.copyAngle ?? "");
  const [copy, setCopy] = useState<Record<CopyField, string>>({
    eyebrow: initial.copy?.eyebrow ?? "",
    headline: initial.copy?.headline ?? "",
    subline: initial.copy?.subline ?? "",
    cta: initial.copy?.cta ?? "",
    badge: initial.copy?.badge ?? "",
  });
  // Velden die de gebruiker zelf aanraakte, overschrijft prefill nooit.
  const dirtyRef = useRef(new Set<CopyField>(
    (Object.keys(initial.copy ?? {}) as CopyField[]).filter((k) => initial.copy?.[k]),
  ));

  const asset = assets.find((a) => a.id === assetId) ?? null;
  const product = products.find((p) => p.id === productId) ?? null;
  const limits = TEMPLATES[template].limits[format];

  /* Prefill bij wisselen van taal, hoek of product — alleen niet-aangeraakte velden. */
  useEffect(() => {
    if (!angle) return;
    const prefill = resolveCopyPrefill(copyBlocks, {
      locale,
      angle,
      productId: productId || null,
      product,
    });
    setCopy((prev) => {
      const next = { ...prev };
      for (const key of ["eyebrow", "headline", "subline", "cta"] as const) {
        if (!dirtyRef.current.has(key) && prefill[key]) next[key] = prefill[key]!;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill alleen bij deze drie triggers
  }, [locale, angle, productId]);

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
      assetId: assetId || null,
      parentId: initial.parentId ?? null,
    }),
    [template, palette, format, locale, copy, angle, productId, assetId, initial.parentId],
  );

  /* Live validatie (dezelfde functie als de approve-poortwachter). */
  const issues = useMemo(
    () =>
      copy.headline
        ? validateSpecCopy({ ...spec, copy: { ...spec.copy, headline: copy.headline } } as CreativeSpec)
        : [],
    [spec, copy.headline],
  );
  const headlineScale = headlineScaleFor(copy.headline.length, limits.headline);

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
        {/* ---------------------------------------------------------- asset */}
        <Card className="p-4">
          <Label>Beeld</Label>
          {assets.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              De bibliotheek is leeg — vul hem eerst via{" "}
              <Link href="/marketing/assets" className="text-accent underline">
                Beeldbibliotheek
              </Link>
              .
            </p>
          ) : (
            <ul
              className="mt-2 flex list-none gap-2 overflow-x-auto pb-1"
              aria-label="Kies een beeld"
            >
              {assets.map((a) => (
                <li key={a.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setAssetId(a.id)}
                    aria-pressed={assetId === a.id}
                    aria-label={`Gebruik ${a.label}`}
                    className={cn(
                      "block overflow-hidden rounded-md border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      assetId === a.id ? "border-accent" : "border-transparent hover:border-border",
                    )}
                  >
                    {a.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.label} className="size-20 object-cover" loading="lazy" />
                    ) : (
                      <span className="flex size-20 items-center justify-center text-[10px] text-muted">
                        geen opslag
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------- product / hoek / taal */}
        <Card className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="Product (optioneel)" htmlFor="ce-product">
            <select
              id="ce-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
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
          {COPY_FIELDS.map(({ key, label, multiline }) => (
            <CopyInput
              key={key}
              id={`ce-${key}`}
              label={label}
              value={copy[key]}
              limit={limits[key]}
              required={key === "headline"}
              multiline={multiline}
              headlineScale={key === "headline" ? headlineScale : undefined}
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
            disabled={pending || !assetId || !copy.headline}
            className={buttonClass({ variant: "secondary" })}
          >
            {savePending ? "Opslaan…" : "Opslaan als concept"}
          </button>
          <button
            type="submit"
            formAction={setActionFn}
            disabled={pending || !assetId || !copy.headline}
            className={buttonClass()}
            title="Genereert 3 formaten × 4 talen als aparte concepten"
          >
            {setPending ? "Set maken…" : "Maak set (12 concepten)"}
          </button>
          {(!assetId || !copy.headline) && (
            <p className="text-xs text-muted">Kies een beeld en vul minimaal een kop in.</p>
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
 * Tekstveld met teller die kleurt bij overschrijding (§6b). Voor de kop toont
 * hij bovendien de automatische verkleiningsstap (88%/78%) vóórdat het echt
 * niet meer past.
 */
function CopyInput({
  id,
  label,
  value,
  limit,
  required,
  multiline,
  headlineScale,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  limit: number;
  required?: boolean;
  multiline?: boolean;
  headlineScale?: 1 | 0.88 | 0.78 | null;
  onChange: (value: string) => void;
}) {
  const len = value.length;
  const isHeadline = headlineScale !== undefined;
  const hardLimit = isHeadline ? Math.floor(limit / 0.78) : limit;
  const over = len > hardLimit;
  const shrinks = isHeadline && !over && len > limit;

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
          {len}/{isHeadline ? limit : hardLimit}
          {shrinks && ` — wordt verkleind naar ${Math.round((headlineScale ?? 0.78) * 100)}%`}
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
