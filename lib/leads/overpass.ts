/**
 * Gratis alternatief voor Google Places: bedrijven zoeken via OpenStreetMap
 * (Overpass API) — geen key, geen billing. Regio wordt eerst via Nominatim naar
 * een bounding box vertaald, daarna vraagt Overpass de bedrijven op basis van
 * OSM-tags. E-mail komt uit de OSM-tags of, als die ontbreekt, best-effort van
 * de bedrijfswebsite (zelfde extractie als bij Places).
 */
import { extractEmailFromSite, type PlaceCategory, type PlaceResult } from "@/lib/leads/places";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = "HabitatOneCRM/1.0 (leads; hi@habitat-one.com)";

/** OSM-tagfilters per categorie (key + waarde-regex). */
const CATEGORY_FILTERS: Record<PlaceCategory, Array<[string, string]>> = {
  architect: [["office", "architect"]],
  aannemer: [
    ["office", "construction_company"],
    ["craft", "builder|carpenter|plasterer|tiler"],
  ],
  makelaar: [["office", "estate_agent"]],
  interieur: [
    ["shop", "furniture|interior_decoration|kitchen|bathroom_furnishing|houseware"],
  ],
  projectontwikkelaar: [
    ["office", "construction_company|property_management|developer"],
  ],
  hovenier: [
    ["shop", "garden_centre"],
    ["craft", "gardener"],
    ["landscape", "yes"],
  ],
  overig: [],
};

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Vertaal een regionaam naar een bounding box (south,west,north,east). */
async function geocodeBbox(region: string): Promise<[string, string, string, string] | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(region + ", España")}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ boundingbox?: [string, string, string, string] }>;
  const bb = data[0]?.boundingbox; // [south, north, west, east]
  if (!bb) return null;
  const [south, north, west, east] = bb;
  return [south, west, north, east];
}

function addressOf(t: Record<string, string>): string | null {
  const parts = [
    [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" "),
    t["addr:postcode"],
    t["addr:city"],
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function searchOverpass(opts: {
  category: PlaceCategory;
  region: string;
  freeText?: string;
  max?: number;
}): Promise<PlaceResult[]> {
  const bbox = await geocodeBbox(opts.region);
  if (!bbox) throw new Error(`Regio "${opts.region}" niet gevonden op OpenStreetMap.`);
  const [s, w, n, e] = bbox;
  const box = `(${s},${w},${n},${e})`;

  const filters = CATEGORY_FILTERS[opts.category] ?? [];
  const clauses: string[] = [];
  const term = opts.freeText?.trim();
  if (term) {
    // Vrije zoekterm → op naam matchen (case-insensitive).
    const safe = term.replace(/["\\]/g, "");
    for (const kind of ["node", "way"]) clauses.push(`${kind}["name"~"${safe}",i]${box};`);
  }
  for (const [k, v] of filters) {
    for (const kind of ["node", "way"]) clauses.push(`${kind}["${k}"~"${v}"]${box};`);
  }
  if (clauses.length === 0) throw new Error("Kies een categorie of vul een zoekterm in.");

  const query = `[out:json][timeout:25];(${clauses.join("")});out center tags ${Math.min(opts.max ?? 40, 80)};`;

  const res = await fetch(OVERPASS, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenStreetMap-fout ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { elements?: OsmElement[] };
  const els = (data.elements ?? []).filter((el) => el.tags?.name);

  // Dedup op naam (node + way van hetzelfde bedrijf).
  const seen = new Set<string>();
  const unique = els.filter((el) => {
    const key = el.tags!.name!.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Promise.all(
    unique.map(async (el): Promise<PlaceResult> => {
      const t = el.tags!;
      const website = t.website || t["contact:website"] || null;
      const emailTag = t.email || t["contact:email"] || null;
      const email = emailTag || (website ? await extractEmailFromSite(website) : null);
      return {
        placeId: `osm-${el.type}-${el.id}`,
        name: t.name!,
        address: addressOf(t),
        website,
        phone: t.phone || t["contact:phone"] || null,
        email,
      };
    }),
  );
}
