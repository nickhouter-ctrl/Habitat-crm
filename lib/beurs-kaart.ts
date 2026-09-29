/**
 * De speldjes voor de beurskaart.
 *
 * Het rekenwerk staat los van het tekenen: wie heeft er coördinaten, welk
 * bedrijf krijgt welke kleur, en welk stuk van de wereld moet er in beeld. Dat
 * laatste is het verschil tussen een bruikbare kaart en een wereldkaart met
 * alle punten op één postzegel: staan ze allemaal in Spanje, dan zoomen we in
 * op Spanje.
 *
 * Eén speldje per bedrijf per plek. Twee bureaus in dezelfde stad zijn twee
 * speldjes met een eigen kleur — anders zie je op de kaart alleen "Valencia"
 * en niet dat daar drie verschillende bedrijven zitten.
 */
import type { BeursContact } from "@/lib/beurs-lijst";
import { landNaam } from "@/lib/landen";

export interface Speld {
  lat: number;
  lon: number;
  /** Stad (en land) zoals we het tonen. */
  plaats: string;
  /** Het bedrijf, of de naam van de bezoeker als hij er geen opgaf. */
  label: string;
  /** Vaste kleur bij dat bedrijf — ook in de legenda. */
  kleur: string;
  /** Wie er van dit bedrijf op deze plek waren. */
  namen: string[];
}

/**
 * Kleuren voor op de kaart: onderling goed te onderscheiden en alle donker
 * genoeg voor het lichte kaartvlak. De eerste is onze eigen terracotta.
 */
const KLEUREN = [
  "#b6552d", "#2f6f6b", "#7d5ba6", "#3a6ea5", "#8a8f2b",
  "#c2185b", "#4a7c2f", "#a8642a", "#2b5d8a", "#6b4c9a",
  "#b03a3a", "#3f7a6d",
];

/**
 * Altijd dezelfde kleur bij hetzelfde bedrijf, ook na herladen of filteren:
 * uit de naam zelf, niet uit de volgorde van de lijst.
 */
export function kleurVoor(label: string): string {
  let som = 0;
  for (let i = 0; i < label.length; i += 1) som = (som * 31 + label.charCodeAt(i)) % 100_000;
  return KLEUREN[som % KLEUREN.length];
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

/** Eén speldje per bedrijf per plek; collega's van hetzelfde bureau samen. */
export function speldjes(rijen: BeursContact[], taal = "nl"): Speld[] {
  const perSpeld = new Map<string, Speld>();
  for (const r of rijen) {
    const lat = getal(r.lat);
    const lon = getal(r.lon);
    if (lat === null || lon === null) continue;
    const label = r.bedrijf?.trim() || r.naam.trim();
    // Afronden op ~100 meter: dezelfde stad levert exact dezelfde coördinaten,
    // maar zo vallen ook twee net iets andere metingen samen.
    const sleutel = `${lat.toFixed(3)},${lon.toFixed(3)}|${label.toLowerCase()}`;
    const plaats = [r.plaats, r.land ? landNaam(r.land, taal) : null].filter(Boolean).join(" · ");
    const bestaand = perSpeld.get(sleutel);
    if (bestaand) {
      if (!bestaand.namen.includes(r.naam)) bestaand.namen.push(r.naam);
    } else {
      perSpeld.set(sleutel, {
        lat,
        lon,
        plaats: plaats || label,
        label,
        kleur: kleurVoor(label),
        namen: [r.naam],
      });
    }
  }
  return [...perSpeld.values()];
}

/** De legenda naast de kaart: elk bedrijf één keer, op alfabet. */
export function legenda(spelden: Speld[]): { label: string; kleur: string; plaats: string; aantal: number }[] {
  const perLabel = new Map<string, { label: string; kleur: string; plaats: string; aantal: number }>();
  for (const s of spelden) {
    const bestaand = perLabel.get(s.label.toLowerCase());
    if (bestaand) bestaand.aantal += s.namen.length;
    else perLabel.set(s.label.toLowerCase(), { label: s.label, kleur: s.kleur, plaats: s.plaats, aantal: s.namen.length });
  }
  return [...perLabel.values()].sort((a, b) => a.label.localeCompare(b.label, "nl", { sensitivity: "base" }));
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
