/**
 * Live wisselkoersen → EUR via Frankfurter (gratis, geen key, ECB-data).
 * Per-instance cache van 1 uur; valt terug op redelijke defaults als de API faalt.
 */

const TTL_MS = 60 * 60 * 1000; // 1 uur
type Cached = { rate: number; fetchedAt: number };
const cache = new Map<string, Cached>();

// Veilige fallback-koersen (1 vreemde valuta = X EUR). Worden alleen gebruikt
// als de live-bron onbereikbaar is — niet als primaire bron.
const FALLBACK_TO_EUR: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CNY: 0.127,
  CHF: 1.05,
  JPY: 0.0062,
};

async function fetchRate(from: string): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.dev/v1/latest?from=${encodeURIComponent(from)}&to=EUR`,
      { cache: "no-store", signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: { EUR?: number } };
    const r = data?.rates?.EUR;
    return typeof r === "number" && r > 0 ? r : null;
  } catch {
    return null;
  }
}

/** Hoeveel EUR krijg je voor 1 eenheid `currency`? */
export async function rateToEur(currency: string | null | undefined): Promise<number> {
  const c = (currency ?? "EUR").toUpperCase();
  if (c === "EUR") return 1;
  const hit = cache.get(c);
  if (hit && Date.now() - hit.fetchedAt < TTL_MS) return hit.rate;
  const live = await fetchRate(c);
  const rate = live ?? FALLBACK_TO_EUR[c] ?? 1;
  cache.set(c, { rate, fetchedAt: Date.now() });
  return rate;
}

/** Reken `amount` om naar EUR met de meest recente koers. */
export async function toEur(amount: number, currency: string | null | undefined): Promise<number> {
  if (!Number.isFinite(amount)) return 0;
  const r = await rateToEur(currency);
  return Math.round(amount * r * 100) / 100;
}
