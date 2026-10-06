/**
 * De maten van een product, elk met eigen prijs — voor de prijslijst.
 *
 * Een wandpaneel heeft een hoofdmaat (`widthMm` × `heightMm`) en vaak een paar
 * andere formaten in `additionalSizes`, elk met een eigen verkoop- en
 * kostprijs. Per maat rekenen we de oppervlakte en de prijs per m² uit, want
 * daarin vergelijken klanten en verkooppunten.
 */
export type MaatRegel = {
  sku: string;
  /** "2950 × 1130" */
  afmeting: string | null;
  m2: number | null;
  prijs: number | null;
  kost: number | null;
  aankoop: number | null;
  /** De maat die ook op het product zelf staat. */
  hoofd: boolean;
};

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** "2950*565", "2400 × 590 mm" → [2950, 565]. */
export function leesMaat(label: string | null | undefined): [number, number] | null {
  const m = String(label ?? "").match(/(\d+(?:[.,]\d+)?)\s*[*x×]\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const w = Number(m[1].replace(",", ".")), h = Number(m[2].replace(",", "."));
  return w > 0 && h > 0 ? [w, h] : null;
}

const afmeting = (w: number, h: number) => `${Math.round(w)} × ${Math.round(h)}`;
const m2 = (w: number, h: number) => Math.round((w * h) / 1e6 * 10000) / 10000;

export function maatRegels(p: {
  sku?: string | null; widthMm?: unknown; heightMm?: unknown; priceEur?: unknown; costEur?: unknown; purchaseCostEur?: unknown;
  additionalSizes?: Array<{ sku?: string | null; label: string; priceEur?: number | null; costEur?: number | null; purchaseEur?: number | null }> | null;
}): MaatRegel[] {
  const w = num(p.widthMm), h = num(p.heightMm);
  const hoofd: MaatRegel = {
    sku: p.sku ?? "", afmeting: w && h ? afmeting(w, h) : null, m2: w && h ? m2(w, h) : null,
    prijs: num(p.priceEur), kost: num(p.costEur), aankoop: num(p.purchaseCostEur), hoofd: true,
  };
  const andere: MaatRegel[] = [];
  for (const s of p.additionalSizes ?? []) {
    const maat = leesMaat(s.label);
    // De hoofdmaat staat vaak ook in de lijst; die niet dubbel tonen.
    if (maat && w && h && Math.round(maat[0]) === Math.round(w) && Math.round(maat[1]) === Math.round(h)) continue;
    andere.push({
      sku: s.sku || "", afmeting: maat ? afmeting(maat[0], maat[1]) : s.label, m2: maat ? m2(maat[0], maat[1]) : null,
      prijs: num(s.priceEur), kost: num(s.costEur), aankoop: num(s.purchaseEur), hoofd: false,
    });
  }
  // Groot naar klein, zodat de grootste plaat bovenaan staat.
  andere.sort((a, b) => (b.m2 ?? 0) - (a.m2 ?? 0));
  return [hoofd, ...andere];
}

/** Prijs per m², of null als de oppervlakte onbekend is. */
export const perM2 = (bedrag: number | null, oppervlak: number | null) =>
  bedrag != null && oppervlak ? Math.round((bedrag / oppervlak) * 100) / 100 : null;
