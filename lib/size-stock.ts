/**
 * Voorraad wordt op het product geboekt (products.stockQty), niet per maat.
 * In de offertekiezer stond daardoor elke maat op "niet op voorraad", ook als
 * er 198 platen 1200×600 liggen (Nick 25-11-2026). De maat die gelijk is aan de
 * afmetingen van het product zelf ís die voorraad; die toont altijd het
 * productgetal. Een eerder op de maat ingevuld getal loopt achter, want alle
 * boekingen (verkoop, levering, inkoop, afschrijving) muteren alleen het
 * product. Andere maten houden hun eigen getal.
 */
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

/** "1200*600", "600 x 1200 mm", "1200×600" → [1200, 600] (groot, klein). */
export function sizeDims(label: string | null | undefined): [number, number] | null {
  const m = (label ?? "").match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const a = Number(m[1].replace(",", ".")), b = Number(m[2].replace(",", "."));
  return a >= b ? [a, b] : [b, a];
}

export function sizeIsProductFormat(label: string | null | undefined, widthMm: unknown, heightMm: unknown): boolean {
  const d = sizeDims(label);
  const w = num(widthMm), h = num(heightMm);
  if (!d || !w || !h) return false;
  const [g, k] = w >= h ? [w, h] : [h, w];
  return Math.abs(d[0] - g) < 1 && Math.abs(d[1] - k) < 1;
}

export function withProductStock<S extends { label?: string; stockQty?: number | null; inStock?: boolean }>(
  sizes: S[], product: { stockQty: unknown; widthMm: unknown; heightMm: unknown },
): S[] {
  const stock = num(product.stockQty);
  if (stock == null) return sizes;
  return sizes.map(s => sizeIsProductFormat(s.label, product.widthMm, product.heightMm)
    ? { ...s, stockQty: stock, inStock: stock > 0 } : s);
}
