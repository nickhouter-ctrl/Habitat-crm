/**
 * De speldjes voor de beurskaart.
 *
 * Het rekenwerk staat los van het tekenen: wie heeft er coördinaten, welk
 * bedrijf krijgt welke kleur, en welk stuk van de wereld moet er in beeld. Dat
 * laatste is het verschil tussen een bruikbare kaart en een wereldkaart met
 * alle punten op één postzegel: staan ze allemaal in Spanje, dan zoomen we in
 * op Spanje.
 *
 * De kleur zegt wat voor bezoeker het is: architecten in één kleur, aannemers
 * in een andere, enzovoort. Zo zie je in één oogopslag waar welk soort klant
 * zit — en dat is wat de opvolging bepaalt.
 *
 * Eén speldje per soort per plek: drie architecten uit Valencia zijn één
 * speldje, een aannemer uit dezelfde stad een tweede ernaast.
 */
import { ROLLEN, rolLabel } from "@/lib/beurs";
import type { BeursContact } from "@/lib/beurs-lijst";
import { landNaam } from "@/lib/landen";

export interface Speld {
  lat: number;
  lon: number;
  /** Stad (en land) zoals we het tonen. */
  plaats: string;
  /** Soort bezoeker ("architect"); bepaalt de kleur. */
  rol: string;
  /** Kleur bij dat soort — dezelfde als in de legenda. */
  kleur: string;
  /** Wie er van dit soort op deze plek zaten. */
  namen: string[];
  /** En van welke bedrijven, voor het label bij aanwijzen. */
  bedrijven: string[];
  contacten: { id: string | null; naam: string; bedrijf: string | null; adres: string | null; exact: boolean }[];
}

/**
 * Eén vaste kleur per soort bezoeker. Onderling goed te onderscheiden en alle
 * donker genoeg voor het lichte kaartvlak; onze eigen terracotta gaat naar de
 * architecten, de grootste groep op de stand.
 */
const ROLKLEUREN: Record<string, string> = {
  architect: "#b6552d",
  ontwerper: "#7d5ba6",
  aannemer: "#2f6f6b",
  wederverkoper: "#8a8f2b",
  particulier: "#3a6ea5",
  anders: "#8a7f72",
};

/** De kleur bij een soort bezoeker; onbekend valt terug op "anders". */
export function kleurVoor(rol: string | null | undefined): string {
  return ROLKLEUREN[rol ?? "anders"] ?? ROLKLEUREN.anders;
}

/** Bereik van de kaart: hoek linksonder en rechtsboven, met wat lucht eromheen. */
export interface Bereik {
  west: number;
  south: number;
  east: number;
  north: number;
}

const getal = (v: string | null): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Eén speldje per soort bezoeker per plek. */
export function speldjes(rijen: BeursContact[], taal = "nl"): Speld[] {
  const perSpeld = new Map<string, Speld>();
  for (const r of rijen) {
    const lat = getal(r.lat);
    const lon = getal(r.lon);
    if (lat === null || lon === null || Math.abs(lat) > 85 || Math.abs(lon) > 180) continue;
    const rol = r.rol ?? "anders";
    // Behoud adresprecisie; alleen echt gelijke locaties delen een speld.
    const sleutel = `${lat.toFixed(6)},${lon.toFixed(6)}|${rol}`;
    const plaats = [r.plaats, r.land ? landNaam(r.land, taal) : null].filter(Boolean).join(" · ");
    const bedrijf = r.bedrijf?.trim() || null;
    const contact = { id: r.contactId, naam: r.naam, bedrijf, adres: [r.adres, r.postcode].filter(Boolean).join(", ") || null, exact: !!r.adres && (r.tags ?? []).includes("geo:adres-bevestigd") };
    const bestaand = perSpeld.get(sleutel);
    if (bestaand) {
      bestaand.contacten.push(contact);
      if (!bestaand.namen.includes(r.naam)) bestaand.namen.push(r.naam);
      if (bedrijf && !bestaand.bedrijven.includes(bedrijf)) bestaand.bedrijven.push(bedrijf);
    } else {
      perSpeld.set(sleutel, {
        lat,
        lon,
        plaats: plaats || r.naam,
        rol,
        kleur: kleurVoor(rol),
        namen: [r.naam],
        bedrijven: bedrijf ? [bedrijf] : [],
        contacten: [contact],
      });
    }
  }
  return [...perSpeld.values()];
}

/**
 * De legenda naast de kaart: elk soort bezoeker één keer, met hoeveel er zijn.
 * In de vaste volgorde van ROLLEN, zodat de legenda niet danst als er iemand
 * bijkomt.
 */
export function legenda(
  spelden: Speld[],
  taal: "nl" | "en" | "es" = "nl",
): { rol: string; label: string; kleur: string; aantal: number }[] {
  const telling = new Map<string, number>();
  for (const s of spelden) telling.set(s.rol, (telling.get(s.rol) ?? 0) + s.contacten.length);
  return ROLLEN.filter((r) => telling.get(r.key)).map((r) => ({
    rol: r.key,
    label: rolLabel(r.key, taal),
    kleur: kleurVoor(r.key),
    aantal: telling.get(r.key) ?? 0,
  }));
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
