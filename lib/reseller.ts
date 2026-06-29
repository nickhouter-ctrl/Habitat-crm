/**
 * Wederverkoper-/dealerlogica. Dealerprijs = particulierprijs −25% (per product
 * te overschrijven via `products.dealerPriceEur`). Norm: minimaal 25% marge voor
 * ons op een dealerverkoop, anders is het niet rendabel.
 */
export const DEALER_DISCOUNT = 0.25; // 25% onder particulierprijs
export const DEALER_MIN_MARGIN_PCT = 25;

/** Effectieve dealerprijs (ex. btw): override indien gezet, anders particulier −25%. */
export function dealerPrice(
  priceEur: number | string | null | undefined,
  override: number | string | null | undefined,
): number | null {
  if (override != null && override !== "") {
    const o = Number(override);
    if (Number.isFinite(o)) return o;
  }
  if (priceEur != null && priceEur !== "") {
    const p = Number(priceEur);
    if (Number.isFinite(p)) return Math.round(p * (1 - DEALER_DISCOUNT) * 100) / 100;
  }
  return null;
}

/** Onze marge% op een dealerverkoop, op de KOSTPRIJS (opslag) = (dealerprijs − kostprijs) / kostprijs. */
export function dealerMarginPct(
  dealer: number | null | undefined,
  cost: number | string | null | undefined,
): number | null {
  if (dealer == null || cost == null || cost === "") return null;
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) return null;
  return Math.round(((dealer - c) / c) * 100);
}
