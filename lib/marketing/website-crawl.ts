/**
 * Website-crawl voor de asset-bibliotheek (U9): media van onze EIGEN site
 * habitat-one.com spiegelen — projectpagina's (incl. before/after) en de
 * inspiratiesecties, afbeeldingen én video's. De brief vermijdt HTML-parsen
 * waar het kan (§5); voor deze secties bestaat geen JSON-bron, dus hier
 * parsen we bewust wél — het is onze eigen site, met een kleine, stabiele
 * paginaset. Downloaden en ingesten doet de sync-route; deze module levert
 * pure, testbare extractie plus het paginabezoek.
 *
 * YouTube/Vimeo-embeds kunnen we niet downloaden — die worden als
 * VERWIJZING vastgelegd (provider + id + kijk-URL), conform de taak.
 */

/** Verwijzing naar een niet-downloadbare video-embed. */
export interface EmbedRef {
  provider: "youtube" | "vimeo";
  id: string;
  /** Publieke kijk-URL (geen embed-URL) — voor de "bekijk op…"-link. */
  url: string;
}

/** Alle media die één pagina oplevert (absolute URL's, per soort ontdubbeld). */
export interface PageMedia {
  images: string[];
  videos: string[];
  embeds: EmbedRef[];
}

/** Basis-URL van de website (override voor staging via WEBSITE_URL). */
export function websiteBaseUrl(): string {
  return (process.env.WEBSITE_URL ?? "https://habitat-one.com").replace(/\/$/, "");
}

/* ------------------------------------------------------------- extractie */

const IMG_SKIP = /\.svg($|\?)|\.ico($|\?)|^data:|logo|favicon|icon[-_.]/i;
const VIDEO_EXT = /\.(mp4|webm|mov)($|\?)/i;

function absolutize(src: string, baseUrl: string): string | null {
  try {
    return new URL(src, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

/** Grootste kandidaat uit een srcset ("a-480.webp 480w, a-1080.webp 1080w"). */
function largestFromSrcset(srcset: string): string | null {
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = descriptor?.endsWith("w") ? Number(descriptor.slice(0, -1)) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? null;
}

/** Herken een YouTube-/Vimeo-embed-URL; null als het er geen is. */
export function embedRefFromUrl(url: string): EmbedRef | null {
  const yt = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,20})/.exec(
    url,
  );
  if (yt) {
    return { provider: "youtube", id: yt[1], url: `https://www.youtube.com/watch?v=${yt[1]}` };
  }
  const vimeo = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})/.exec(url);
  if (vimeo) {
    return { provider: "vimeo", id: vimeo[1], url: `https://vimeo.com/${vimeo[1]}` };
  }
  return null;
}

/**
 * Pure media-extractie uit HTML: `<img>` (src + grootste srcset-kandidaat,
 * zonder logo's/iconen/svg/data-URI's), `<video src>`/`<source src>` en
 * iframe-embeds. Regex-gebaseerd — bewust simpel: het is onze eigen,
 * voorspelbare Next.js-site, geen vreemde opmaak.
 */
export function extractMediaFromHtml(html: string, baseUrl: string): PageMedia {
  const images = new Set<string>();
  const videos = new Set<string>();
  const embeds = new Map<string, EmbedRef>();

  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const srcset = /srcset\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const candidate = (srcset && largestFromSrcset(srcset)) || src;
    if (!candidate || IMG_SKIP.test(candidate)) continue;
    const abs = absolutize(candidate, baseUrl);
    if (abs) images.add(abs);
  }

  for (const m of html.matchAll(/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    if (!VIDEO_EXT.test(m[1])) continue;
    const abs = absolutize(m[1], baseUrl);
    if (abs) videos.add(abs);
  }

  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const ref = embedRefFromUrl(m[1]);
    if (ref) embeds.set(`${ref.provider}:${ref.id}`, ref);
  }

  return { images: [...images], videos: [...videos], embeds: [...embeds.values()] };
}

/** Interne links onder een prefix (bv. "/projects/"), absoluut en ontdubbeld. */
export function extractLinks(html: string, baseUrl: string, prefix: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#?]+)["']/gi)) {
    const abs = absolutize(m[1], baseUrl);
    if (!abs?.startsWith(baseUrl)) continue;
    const path = abs.slice(baseUrl.length).replace(/\/$/, "");
    // Alleen échte subpagina's van de sectie, niet de sectiepagina zelf.
    if (path.startsWith(prefix) && path.length > prefix.length) {
      links.add(`${baseUrl}${path}`);
    }
  }
  return [...links];
}

/* ------------------------------------------------------------------- tags */

/** Sectietags per pagina: project + slug, of inspiratie + subsectie. */
export function sectionTagsForPage(pageUrl: string): string[] {
  const path = new URL(pageUrl).pathname.replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "projects") {
    return segments[1] ? ["project", segments[1]] : ["project"];
  }
  if (segments[0] === "inspiration") {
    return segments[1] ? ["inspiratie", segments[1]] : ["inspiratie"];
  }
  return [];
}

const EXTERIOR_HINTS =
  /\b(pool|piscina|garden|jard[ií]n|tuin|terra[sz]|terrace|gevel|fa[cç]ade|fachada|exterior|buiten|outdoor|driveway|oprit)\b/i;
const INTERIOR_HINTS =
  /\b(badkamer|bathroom|ba[ñn]o|keuken|kitchen|cocina|slaapkamer|bedroom|living|salon|interieur|interior|binnen|indoor|wall panel|wandpane(el|len)|shower|douche|vloer|floor(ing)?)\b/i;

/**
 * Interieur/exterieur waar afleidbaar uit context (paginatekst, alt-teksten,
 * URL). Best-effort heuristiek: bij twijfel null — liever geen tag dan een
 * verkeerde.
 */
export function inferEnvironmentTag(context: string): "interieur" | "exterieur" | null {
  const exterior = EXTERIOR_HINTS.test(context);
  const interior = INTERIOR_HINTS.test(context);
  if (exterior && !interior) return "exterieur";
  if (interior && !exterior) return "interieur";
  return null;
}

/* ------------------------------------------------------------------ crawl */

/** Vaste inspiratiesecties van de site (door de Coordinator gecheckt). */
export const INSPIRATION_SECTIONS = ["events", "news", "tips", "blog"] as const;

/** Noodrem op het aantal bezochte pagina's per sync-run. */
const MAX_PAGES = 40;

/** Haal één pagina op; null bij een fout (de sync rapporteert per pagina). */
export async function fetchPageHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "HabitatCRM-AssetSync/1.0 (eigen site)" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Eén te verwerken pagina met zijn media en tags. */
export interface CrawledPage {
  url: string;
  media: PageMedia;
  tags: string[];
}

/**
 * Bezoek /projects en /inspiration/{events,news,tips,blog} plus hun
 * subpagina's (één niveau diep) en lever per pagina de media met sectietags
 * en — waar afleidbaar — interieur/exterieur. Sequentieel en met een harde
 * paginalimiet; het is onze eigen site.
 */
export async function crawlWebsiteMedia(): Promise<{ pages: CrawledPage[]; errors: string[] }> {
  const base = websiteBaseUrl();
  const errors: string[] = [];
  const pageUrls = new Set<string>();

  // Sectiepagina's zelf tellen mee (hero-/overzichtsbeelden).
  const listings: Array<{ url: string; prefix: string }> = [
    { url: `${base}/projects`, prefix: "/projects/" },
    ...INSPIRATION_SECTIONS.map((s) => ({
      url: `${base}/inspiration/${s}`,
      prefix: `/inspiration/${s}/`,
    })),
  ];
  for (const listing of listings) {
    pageUrls.add(listing.url);
    const html = await fetchPageHtml(listing.url);
    if (!html) {
      errors.push(`Pagina niet leesbaar: ${listing.url}`);
      continue;
    }
    for (const link of extractLinks(html, base, listing.prefix)) pageUrls.add(link);
  }

  const pages: CrawledPage[] = [];
  for (const url of [...pageUrls].slice(0, MAX_PAGES)) {
    const html = await fetchPageHtml(url);
    if (!html) {
      errors.push(`Pagina niet leesbaar: ${url}`);
      continue;
    }
    const media = extractMediaFromHtml(html, base);
    const tags = [...sectionTagsForPage(url)];
    // Context voor de omgevings-tag: URL + alt-teksten + koppen, geen hele body.
    const context = [
      url,
      ...[...html.matchAll(/\balt\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
      ...[...html.matchAll(/<h[12][^>]*>([^<]+)</gi)].map((m) => m[1]),
    ].join(" ");
    const environment = inferEnvironmentTag(context);
    if (environment) tags.push(environment);
    pages.push({ url, media, tags });
  }

  return { pages, errors };
}
