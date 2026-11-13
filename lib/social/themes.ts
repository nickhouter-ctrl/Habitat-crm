/**
 * Thema's en voorkeuren voor social-posts, afgeleid uit bestandsnaam en tags
 * van een bibliotheekbeeld (de Drive-import draagt nuttige namen mee, zoals
 * `column-wrapped`, `curved-shower`, `install-adhesive`, `MS-033-…-interieur`).
 * De bestaande marketingtaxonomie (lib/marketing/taxonomy.ts) is een
 * productmenu, geen beeldthema — daarom deze eigen, kleine indeling.
 *
 * Stijlrichting van de eigenaar: Spaanse luxe-villa / Ibiza (witgekalkte
 * muren, kalk/travertin, warme houten balken, terracotta, bogen, olijfbomen,
 * zwembad, zeelicht); echte montage en textuur/aanraking boven kale renders;
 * géén zwarte/donkere marmerlooks.
 */

export type SocialTheme =
  | "installation"
  | "texture"
  | "column"
  | "shower"
  | "bathroom"
  | "kitchen"
  | "curved"
  | "outdoor"
  | "benefit"
  | "interior"
  | "product"
  | "general";

/** Volgorde = prioriteit: de eerste regel die past bepaalt het thema. */
const THEME_RULES: [SocialTheme, string[]][] = [
  ["installation", ["install", "installation", "adhesive", "glue", "montage", "mounting", "cutting", "cut", "trowel", "step", "howto", "how-to", "tool", "instalacion"]],
  ["texture", ["texture", "textura", "closeup", "close-up", "detail", "macro", "touch", "hand", "hands"]],
  ["column", ["column", "pillar", "columna", "zuil", "pilar"]],
  ["shower", ["shower", "ducha", "douche"]],
  ["bathroom", ["bathroom", "bano", "baño", "badkamer", "bath", "wc", "toilet"]],
  ["kitchen", ["kitchen", "cocina", "keuken"]],
  ["curved", ["curved", "curve", "round", "rounded", "arch", "arco", "boog"]],
  ["outdoor", ["facade", "fachada", "gevel", "exterior", "outdoor", "garden", "jardin", "terrace", "terraza", "pool", "piscina"]],
  ["benefit", ["benefit", "benefits", "ventaja", "voordeel"]],
  ["interior", ["interieur", "interior", "living", "salon", "bedroom", "dormitorio", "hallway", "wall"]],
];

/** Kleine letters, accenten weg, alles behalve letters/cijfers → "-". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Tokens van naam + tags, als "-a-b-c-" zodat we op hele woorden(reeksen) matchen. */
function tokenString(name: string | null | undefined, tags: string[] | null | undefined): string {
  const parts = [name ?? "", ...(tags ?? [])].map(normalizeName).filter(Boolean);
  return `-${parts.join("-")}-`;
}

function hasKeyword(tokens: string, keyword: string): boolean {
  const kw = normalizeName(keyword);
  return kw.length > 0 && tokens.includes(`-${kw}-`);
}

/** Productcode MS-001..MS-374 uit naam of tags, of null. */
export function productCode(name: string | null | undefined, tags?: string[] | null): string | null {
  const m = tokenString(name, tags).match(/-ms-?(\d{3})-/);
  return m ? `MS-${m[1]}` : null;
}

export function deriveTheme(name: string | null | undefined, tags?: string[] | null): SocialTheme {
  const tokens = tokenString(name, tags);
  for (const [theme, words] of THEME_RULES) {
    if (words.some((w) => hasKeyword(tokens, w))) return theme;
  }
  return productCode(name, tags) ? "product" : "general";
}

/** Valt een beeld onder de uitsluitlijst (bv. zwart/donker marmer)? */
export function isExcluded(
  name: string | null | undefined,
  tags: string[] | null | undefined,
  excludeKeywords: string[],
): boolean {
  const tokens = tokenString(name, tags);
  return excludeKeywords.some((kw) => hasKeyword(tokens, kw));
}

const STYLE_WORDS = ["villa", "ibiza", "mediterranean", "mediterraneo", "whitewash", "whitewashed", "lime", "cal", "travertine", "travertino", "terracotta", "olive", "olivo", "arch", "pool", "beam", "beams", "sea", "warm", "natural", "sand", "beige", "cream"];
const REAL_WORDS = ["project", "proyecto", "obra", "real", "client", "cliente", "before", "after", "werf", "javea", "xabia"];
const RENDER_WORDS = ["render", "3d", "mockup", "ai", "generated", "cgi"];

/**
 * Voorkeursscore: hoger = liever posten. Echte montage, textuur en aanraking
 * en de villa/Ibiza-stijl tellen op; renders en AI-beelden tellen af.
 */
export function preferenceScore(input: {
  name: string | null | undefined;
  tags?: string[] | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
}): number {
  const tokens = tokenString(input.name, input.tags);
  const theme = deriveTheme(input.name, input.tags);
  let score = 0;
  if (theme === "installation" || theme === "texture") score += 3;
  if (["hand", "hands", "touch"].some((w) => hasKeyword(tokens, w))) score += 2;
  if (REAL_WORDS.some((w) => hasKeyword(tokens, w))) score += 2;
  score += Math.min(2, STYLE_WORDS.filter((w) => hasKeyword(tokens, w)).length);
  if (RENDER_WORDS.some((w) => hasKeyword(tokens, w))) score -= 3;
  if (input.source === "generated") score -= 3;
  if (input.width != null && input.height != null && Math.min(input.width, input.height) < 900) score -= 1;
  return score;
}

/** Onderwerp-hashtags per thema (de vaste lokale tags komen in caption.ts). */
export const THEME_HASHTAGS: Record<SocialTheme, string[]> = {
  installation: ["#installation", "#instalacion", "#DIY"],
  texture: ["#stonetexture", "#texturapiedra"],
  column: ["#column", "#columna"],
  shower: ["#showerdesign", "#ducha"],
  bathroom: ["#bathroomdesign", "#baño"],
  kitchen: ["#kitchendesign", "#cocina"],
  curved: ["#curvedwalls", "#paredcurva"],
  outdoor: ["#facade", "#fachada", "#villadesign"],
  benefit: ["#renovation", "#reforma"],
  interior: ["#interiordesign", "#interiorismo"],
  product: ["#stonewall", "#paredpiedra"],
  general: ["#interiordesign", "#reforma"],
};

/** Nederlandse label voor het thema (review-pagina, mail). */
export const THEME_LABELS: Record<SocialTheme, string> = {
  installation: "Montage",
  texture: "Textuur",
  column: "Zuil",
  shower: "Douche",
  bathroom: "Badkamer",
  kitchen: "Keuken",
  curved: "Rond/gebogen",
  outdoor: "Gevel & buiten",
  benefit: "Voordelen",
  interior: "Interieur",
  product: "Product",
  general: "Algemeen",
};

export function isSocialTheme(v: string): v is SocialTheme {
  return v in THEME_LABELS;
}
