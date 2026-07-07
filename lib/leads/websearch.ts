/**
 * Gratis website-zoeker: vindt de vermoedelijke bedrijfswebsite via de DuckDuckGo
 * HTML-endpoint (geen key). Best-effort — geeft null bij twijfel of blokkade.
 * Filtert sociale media/directories eruit zodat we een echte bedrijfssite krijgen.
 */
const DDG = "https://html.duckduckgo.com/html/";
const UA = "Mozilla/5.0 (compatible; HabitatOneBot/1.0)";

const SKIP = /(facebook|instagram|linkedin|twitter|x\.com|youtube|tiktok|pinterest|google\.|maps\.|tripadvisor|yelp|paginasamarillas|europages|wikipedia|booking\.|idealista|fotocasa)/i;

export async function findWebsite(companyName: string, region?: string): Promise<string | null> {
  const q = `${companyName} ${region ?? ""}`.trim();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${DDG}?q=${encodeURIComponent(q)}`, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // DDG HTML: resultaat-links staan als uddg=<encoded url> of directe href.
    for (const m of html.matchAll(/uddg=([^"&]+)/gi)) {
      const url = decodeURIComponent(m[1]);
      if (/^https?:\/\//i.test(url) && !SKIP.test(url)) return url;
    }
    for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/gi)) {
      const url = m[1];
      if (!SKIP.test(url) && !/duckduckgo\.com/i.test(url)) return url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
