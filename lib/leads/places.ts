/**
 * Bedrijven vinden via de Google Places API (Text Search, v1) + best-effort
 * e-mailadres van de bedrijfswebsite halen. Places geeft zelf geen e-mail terug,
 * dus we scrapen de homepage/contactpagina naar een role-based adres.
 *
 * Vereist env GOOGLE_MAPS_API_KEY (Places API (New) aangezet in Google Cloud).
 */

export type PlaceCategory =
  | "architect"
  | "aannemer"
  | "makelaar"
  | "interieur"
  | "projectontwikkelaar"
  | "hovenier"
  | "overig";

/** Zoekterm per categorie (Spaans — meeste treffers op de Costa Blanca). */
const CATEGORY_QUERY: Record<PlaceCategory, string> = {
  architect: "estudio de arquitectura",
  aannemer: "empresa de construcción y reformas",
  makelaar: "inmobiliaria",
  interieur: "tienda de interiorismo y muebles",
  projectontwikkelaar: "promotora inmobiliaria",
  hovenier: "empresa de jardinería y paisajismo",
  overig: "",
};

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
}

interface PlacesApiPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
}

export function placesConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY?.trim();
}

/** Roept de Places Text Search aan. Gooit een leesbare fout als de key ontbreekt of Google faalt. */
export async function searchPlaces(opts: {
  category: PlaceCategory;
  region: string;
  freeText?: string;
  max?: number;
}): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY ontbreekt — zet de Places API-sleutel in de omgeving.");

  const term = (opts.freeText?.trim() || CATEGORY_QUERY[opts.category] || "empresa").trim();
  const textQuery = `${term} en ${opts.region.trim()}`;
  const max = Math.min(Math.max(opts.max ?? 20, 1), 20);

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber",
    },
    body: JSON.stringify({ textQuery, languageCode: "es", regionCode: "ES", maxResultCount: max }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Places-fout ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: PlacesApiPlace[] };
  const places = data.places ?? [];

  // E-mail best-effort ophalen van de website (parallel, met timeout).
  return Promise.all(
    places.map(async (p): Promise<PlaceResult> => {
      const website = p.websiteUri ?? null;
      const email = website ? await extractEmailFromSite(website) : null;
      return {
        placeId: p.id,
        name: p.displayName?.text ?? "(onbekend)",
        address: p.formattedAddress ?? null,
        website,
        phone: p.nationalPhoneNumber ?? null,
        email,
      };
    }),
  );
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const BAD_EMAIL = /(noreply|no-reply|example\.|sentry\.|wixpress|\.png|\.jpg|\.gif|\.webp|@sentry)/i;
const ROLE_PREFIX = /^(info|contact|contacto|hola|hello|mail|admin|office|ventas|sales|reservas)@/i;

/** Haalt best-effort één bruikbaar e-mailadres van een bedrijfswebsite. */
export async function extractEmailFromSite(website: string): Promise<string | null> {
  let base: URL;
  try {
    base = new URL(website);
  } catch {
    return null;
  }
  const candidates = [base.href, new URL("/contact", base).href, new URL("/contacto", base).href];
  const found = new Set<string>();

  for (const url of candidates) {
    const html = await fetchText(url);
    if (!html) continue;
    // mailto: heeft voorrang — bewust gepubliceerd adres.
    for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) addEmail(found, m[1]);
    for (const m of html.matchAll(EMAIL_RE)) addEmail(found, m[0]);
    if ([...found].some((e) => ROLE_PREFIX.test(e))) break; // goed genoeg
  }
  if (found.size === 0) return null;
  const list = [...found];
  // Voorkeur: role-based adres op hetzelfde domein.
  const domain = base.hostname.replace(/^www\./, "");
  return (
    list.find((e) => ROLE_PREFIX.test(e) && e.toLowerCase().endsWith(domain.toLowerCase())) ||
    list.find((e) => ROLE_PREFIX.test(e)) ||
    list.find((e) => e.toLowerCase().endsWith(domain.toLowerCase())) ||
    list[0]
  );
}

function addEmail(set: Set<string>, raw: string) {
  const e = decodeURIComponent(raw).trim().toLowerCase();
  if (EMAIL_RE.test(e) && !BAD_EMAIL.test(e)) set.add(e);
  EMAIL_RE.lastIndex = 0;
}

async function fetchText(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; HabitatOneBot/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return null;
    return (await res.text()).slice(0, 500_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
