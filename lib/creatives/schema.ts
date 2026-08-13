/**
 * CreativeSpec — de spec is de waarheid, de PNG is een afgeleide (brief §3.2).
 *
 * Dit zod-schema valideert alles wat de rendermotor binnenkrijgt, of het nu
 * uit de editor (base64-JSON), uit de database (spec_id) of uit de
 * publicatieketen komt. `specHash` levert de cache-sleutel voor de
 * `renders`-tabel: ongewijzigde hash = bestaande PNG hergebruiken.
 */
import { createHash } from "node:crypto";

import { z } from "zod";

import {
  FORMAT_NAMES,
  PALETTE_NAMES,
  TEMPLATE_NAMES,
  type Palette,
  type TypeScale,
} from "./tokens";

/* ------------------------------------------------------------------- schema */

/** De vijf tekstrollen van een creative. Alleen de kop is verplicht.
 *  Maxima hier zijn ruime bovengrenzen; de échte, sjabloon-specifieke
 *  tekenlimieten staan als data in de registry (templates/index.ts, §6b). */
export const creativeCopySchema = z.object({
  eyebrow: z.string().max(400).optional(),
  headline: z.string().min(1, "Kop is verplicht").max(400),
  subline: z.string().max(600).optional(),
  cta: z.string().max(200).optional(),
  badge: z.string().max(200).optional(),
});

export const creativeSpecSchema = z.object({
  template: z.enum(TEMPLATE_NAMES),
  palette: z.enum(PALETTE_NAMES),
  format: z.enum(FORMAT_NAMES),
  locale: z.enum(["nl", "en", "es", "de"]),
  copy: creativeCopySchema,
  copyAngle: z.enum(["material", "price", "showroom", "project", "seasonal"]).nullish(),
  productId: z.uuid().nullish(),
  assetId: z.uuid().nullish(),
});

/**
 * Een spec die direct te renderen is: mét opgeloste beeld-URL. Alleen https
 * of een data-image-URI — geen http, file of andere schema's (SSRF-waakhond;
 * Satori haalt deze URL zelf op).
 */
export const renderableSpecSchema = creativeSpecSchema.extend({
  assetUrl: z
    .string()
    .max(4_000_000) // ruimte voor data-URI's; https-URL's zijn veel korter
    .refine(
      (u) =>
        u.startsWith("https://") ||
        /^data:image\/(png|jpeg|webp|avif|gif);base64,/.test(u),
      "assetUrl moet met https:// beginnen of een data:image-URI zijn",
    ),
});

export type CreativeCopy = z.infer<typeof creativeCopySchema>;
export type CreativeSpec = z.infer<typeof creativeSpecSchema>;
export type RenderableSpec = z.infer<typeof renderableSpecSchema>;

/* ------------------------------------------------------------ template-props */

/** Props die elk sjabloon-component ontvangt van de rendermotor. */
export interface TemplateProps {
  spec: RenderableSpec;
  palette: Palette;
  size: { width: number; height: number };
  typeScale: TypeScale;
  /** 1, 0.88 of 0.78 — automatische kopverkleining (§6b). */
  headlineScale: number;
  /** 1, 0.88 of 0.78 — automatische verkleining van de subregel (U10). */
  sublineScale: number;
  /** Logo als data-URI, variant passend bij het palet. */
  logoUri: string;
}

/* ---------------------------------------------------------------- spec-hash */

/** Recursief gesorteerde JSON zodat sleutelvolgorde de hash niet beïnvloedt. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

/**
 * Stabiele SHA-256 over de genormaliseerde spec-JSON. Cache-sleutel voor de
 * `renders`-tabel: bij ongewijzigde hash wordt de bestaande PNG hergebruikt.
 */
export function specHash(spec: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(spec))).digest("hex");
}
