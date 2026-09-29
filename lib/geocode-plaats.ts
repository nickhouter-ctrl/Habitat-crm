import "server-only";

/**
 * Plaatsnaam → coördinaten, via Nominatim (OpenStreetMap): gratis, geen sleutel.
 *
 * Eén keer per bezoeker, op het moment van invoeren, en het resultaat gaat op
 * het contact. Zo hoeft de kaart later niets meer op te zoeken en blijven we
 * ver onder wat Nominatim van ons vraagt.
 *
 * Lukt het niet — onbereikbaar, traag, plaats niet gevonden — dan is dat geen
 * fout: de bezoeker staat gewoon vast, alleen zonder speldje op de kaart.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "HabitatOneCRM/1.0 (beurs; hi@habitat-one.com)";

export interface Coordinaat {
  lat: number;
  lon: number;
}

export async function zoekCoordinaten(zoekterm: string): Promise<Coordinaat | null> {
  const q = zoekterm.trim();
  if (q.length < 2) return null;
  try {
    // Kort wachten hoort bij een invoerscherm op een stand: liever geen speldje
    // dan een formulier dat blijft hangen.
    const res = await fetch(`${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1`, {
      headers: { "user-agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}
