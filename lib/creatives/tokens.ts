/**
 * Ontwerp-tokens voor de creative-rendermotor (brief §6): paletten, formaten,
 * typeschaal en logovarianten. Puur data — geen Node-API's — zodat ook client
 * components (editor-pickers) dit veilig kunnen importeren.
 *
 * De vier paletten zijn afgeleid van de huisstijl van habitat-one.com:
 * diep zeegroen `#0f2e36` met een cremekleurig logo. Elk palet levert de vijf
 * rollen die de sjablonen gebruiken: `ground` (ondergrond), `ink` (primaire
 * tekst), `muted` (secundaire tekst), `accent` (knop/badge) en `onAccent`
 * (tekst óp accent).
 */

/* ------------------------------------------------------------------ paletten */

export const PALETTE_NAMES = ["diep", "creme", "terracotta", "salie"] as const;
export type PaletteName = (typeof PALETTE_NAMES)[number];

export interface Palette {
  ground: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  /** Welke logovariant leesbaar is op `ground`. */
  logo: "cream" | "dark";
}

export const PALETTES: Record<PaletteName, Palette> = {
  /** Huisstijl: diep zeegroen met warm goud. */
  diep: {
    ground: "#0f2e36",
    ink: "#f7f1e3",
    muted: "#a9bfc4",
    accent: "#d9a13b",
    onAccent: "#0f2e36",
    logo: "cream",
  },
  /** Lichte variant: creme met zeegroen en terracotta-accent. */
  creme: {
    ground: "#f7f1e3",
    ink: "#0f2e36",
    muted: "#5d7379",
    accent: "#bf5b2d",
    onAccent: "#f7f1e3",
    logo: "dark",
  },
  /** Warm terracotta — aards, past bij natuursteen. */
  terracotta: {
    ground: "#9c4a26",
    ink: "#f9efe6",
    muted: "#e5c3ad",
    accent: "#f7f1e3",
    onAccent: "#9c4a26",
    logo: "cream",
  },
  /** Gedempt saliegroen met goud. */
  salie: {
    ground: "#47594f",
    ink: "#f2f1e8",
    muted: "#bcc8bb",
    accent: "#dfb35c",
    onAccent: "#2e3a33",
    logo: "cream",
  },
};

/* ------------------------------------------------------------------ formaten */

export const FORMAT_NAMES = ["1080x1080", "1080x1350", "1080x1920"] as const;
export type FormatName = (typeof FORMAT_NAMES)[number];

export const FORMATS: Record<FormatName, { width: number; height: number; label: string }> = {
  "1080x1080": { width: 1080, height: 1080, label: "Feed vierkant" },
  "1080x1350": { width: 1080, height: 1350, label: "Feed portret" },
  "1080x1920": { width: 1080, height: 1920, label: "Story" },
};

/* ---------------------------------------------------------------- sjablonen */

/** Canonieke sjabloonnamen — de registry (templates/index.ts) en het
 *  zod-schema leiden hier allebei van af, zodat er één bron van waarheid is. */
export const TEMPLATE_NAMES = ["frame", "split", "swatch", "price"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

/* --------------------------------------------------------------- typeschaal */

export interface TypeScale {
  eyebrow: number;
  headline: number;
  subline: number;
  cta: number;
  badge: number;
}

/** Basis-lettergroottes in pixels, per formaat. De kop kan hier via de
 *  automatische verkleining (§6b) nog 88% of 78% van worden. */
export const TYPE_SCALE: Record<FormatName, TypeScale> = {
  "1080x1080": { eyebrow: 34, headline: 92, subline: 44, cta: 38, badge: 34 },
  "1080x1350": { eyebrow: 36, headline: 100, subline: 46, cta: 40, badge: 36 },
  "1080x1920": { eyebrow: 40, headline: 112, subline: 52, cta: 44, badge: 38 },
};

/* ----------------------------------------------------------------------- logo */

/** Padnamen (relatief aan de projectroot) van de logovarianten. */
export const LOGO_FILES: Record<"cream" | "dark", string> = {
  cream: "public/brand/habitat-one-logo-cream.png",
  dark: "public/brand/habitat-one-logo.png",
};

/** Beeldverhouding van het logobestand (1251×558) — voor expliciete maten in Satori. */
export const LOGO_ASPECT = 1251 / 558;
