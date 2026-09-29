/**
 * De speldjes voor de beurskaart.
 *
 * Het rekenwerk staat los van het tekenen: welke bezoekers hebben coördinaten,
 * hoeveel zitten er op dezelfde plek (die willen we als één speldje met een
 * aantal), en welk stuk van de wereld moet er in beeld. Dat laatste is het
 * verschil tussen een bruikbare kaart en een wereldkaart met alle punten op
 * één postzegel: staan ze allemaal in Spanje, dan zoomen we in op Spanje.
 */
import type { BeursContact } from "@/lib/beurs-lijst";
import { landNaam } from "@/lib/landen";

export interface Speld {
  lat: number;
  lon: number;
  /** Stad (en land) zoals we het tonen. */
  plaats: string;
  /** Wie er op deze plek zitten — voor het label bij aanwijzen. */
  namen: string[];
}

/** Bereik van de kaart: hoek linksonder en rechtsboven, met wat lucht eromheen. */
export interface Bereik {
  west: number;
  south: number;
  east: number;
  north: number;
}

const getal = (v: string | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Eén speldje per plek; wie op dezelfde stad zit komt bij elkaar te staan. */
export function speldjes(rijen: BeursContact[], taal = "nl"): Speld[] {
  const perPlek = new Map<string, Speld>();
  for (const r of rijen) {
    const lat = getal(r.lat);
    const lon = getal(r.lon);
    if (lat === null || lon === null) continue;
    // Afronden op ~100 meter: dezelfde stad levert exact dezelfde coördinaten,
    // maar zo vallen ook twee net iets andere metingen samen.
    const sleutel = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    const plaats = [r.plaats, r.land ? landNaam(r.land, taal) : null].filter(Boolean).join(" · ");
    const bestaand = perPlek.get(sleutel);
    if (bestaand) {
      if (!bestaand.namen.includes(r.naam)) bestaand.namen.push(r.naam);
    } else {
      perPlek.set(sleutel, { lat, lon, plaats: plaats || r.naam, namen: [r.naam] });
    }
  }
  return [...perPlek.values()];
}

/**
 * Het stuk wereld dat in beeld moet. Eén speldje zou anders oneindig inzoomen,
 * dus er zit een ondergrens op: een kaart waarop je alleen een stad ziet zegt
 * niets over wáár die stad ligt.
 */
export function bereikVoor(spelden: Speld[]): Bereik | null {
  if (spelden.length === 0) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const s of spelden) {
    west = Math.min(west, s.lon);
    east = Math.max(east, s.lon);
    south = Math.min(south, s.lat);
    north = Math.max(north, s.lat);
  }
  // Minimaal een graad of vijf in beeld, plus een tiende rand eromheen: dichter
  // erop en je ziet een stad zonder te weten waar hij ligt. Verder inzoomen kan
  // op de kaart zelf.
  const midLon = (west + east) / 2;
  const midLat = (south + north) / 2;
  const breed = Math.max(east - west, 5) * 1.2;
  const hoog = Math.max(north - south, 5) * 1.2;
  return {
    west: Math.max(-180, midLon - breed / 2),
    east: Math.min(180, midLon + breed / 2),
    south: Math.max(-85, midLat - hoog / 2),
    north: Math.min(85, midLat + hoog / 2),
  };
}

/** Hoeveel bezoekers per land — de lijst naast de kaart. */
export function perLand(rijen: BeursContact[], taal = "nl"): { land: string; aantal: number }[] {
  const telling = new Map<string, number>();
  for (const r of rijen) {
    const land = r.land?.trim();
    if (!land) continue;
    telling.set(landNaam(land, taal), (telling.get(landNaam(land, taal)) ?? 0) + 1);
  }
  return [...telling.entries()]
    .map(([land, aantal]) => ({ land, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.land.localeCompare(b.land));
}

/** Hoeveel bezoekers per stad — daar begin je de opvolging mee. */
export function perPlaats(rijen: BeursContact[], taal = "nl"): { plaats: string; aantal: number }[] {
  const telling = new Map<string, number>();
  for (const r of rijen) {
    const plaats = r.plaats?.trim();
    if (!plaats) continue;
    const sleutel = [plaats, r.land?.trim() ? landNaam(r.land, taal) : null].filter(Boolean).join(" · ");
    telling.set(sleutel, (telling.get(sleutel) ?? 0) + 1);
  }
  return [...telling.entries()]
    .map(([plaats, aantal]) => ({ plaats, aantal }))
    .sort((a, b) => b.aantal - a.aantal || a.plaats.localeCompare(b.plaats));
}
