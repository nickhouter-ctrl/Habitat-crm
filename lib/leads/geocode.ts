/**
 * Regionaam → coördinaten via Nominatim (OpenStreetMap), gratis en zonder key.
 * Gedeeld door de OSM- en Places-zoekbronnen (voor een straal rond een plaats).
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "HabitatOneCRM/1.0 (leads; hi@habitat-one.com)";

export interface Geo {
  lat: number;
  lon: number;
  bbox: [string, string, string, string]; // south, west, north, east
}

export async function geocodeRegion(region: string): Promise<Geo | null> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(region + ", España")}&format=json&limit=1`;
  const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat?: string; lon?: string; boundingbox?: [string, string, string, string] }>;
  const hit = data[0];
  if (!hit?.lat || !hit?.lon || !hit.boundingbox) return null;
  const [south, north, west, east] = hit.boundingbox; // Nominatim: [south, north, west, east]
  return { lat: Number(hit.lat), lon: Number(hit.lon), bbox: [south, west, north, east] };
}
