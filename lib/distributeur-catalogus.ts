import { distributeurPrijzen, type Distributeurprijs, type PrijsOpties } from "@/lib/distributeur-prijzen";

export type Kostenbron = "maat" | "basis" | "conservatief" | "raming" | "ontbreekt";
export interface DistributeurMaat extends Distributeurprijs {
  dim: string; sku: string | null; areaM2: number | null; inStock: boolean;
  kostenbron: Kostenbron; geregistreerdeKost: number | null; geraamdeKost: number | null; extraKost: number;
}
export interface DistributeurItem {
  id: string; groep: string; naam: string; sku: string | null; imageUrl: string | null; maten: DistributeurMaat[];
}
type Size = { sku?: string; label?: string; priceEur?: number | null; costEur?: number | null; inStock?: boolean; stockQty?: number | null };
export type CatalogusPaneel = {
  id: string; name: string; sku: string | null; category: string | null; imageUrl: string | null;
  widthMm: string | number | null; heightMm: string | number | null; description: string | null;
  additionalSizes: Size[] | null; price: string | number | null; cost: string | number | null;
  vatRate: number; stockQty: string | number | null;
};
const positief = (n: unknown) => n != null && Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null;
export function oppervlak(label: string | null | undefined): number | null {
  const m = String(label ?? "").match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/i);
  return m ? Number(m[1]) * Number(m[2]) / 1_000_000 : null;
}
function maatLabel(label: string) {
  const m = label.trim().match(/^(\d{2,4})\s*[*x×]\s*(\d{2,4})(?:\s*mm)?$/i);
  return m ? `${Math.max(+m[1], +m[2])} × ${Math.min(+m[1], +m[2])} mm` : label;
}

/** Een andere maat krijgt geen offerteprijs op basis van een ongetoetste raming.
 * Bij tegenstrijdige kosten voor dezelfde maat gebruiken we de hoogste waarde.
 * Ruwe inkoop wordt nooit stilzwijgend als volledige landed cost behandeld. */
export function catalogusItems(rows: CatalogusPaneel[], opties: PrijsOpties = {}): DistributeurItem[] {
  const extraPerM2 = opties.extraKostenPerM2 ?? 0;
  if (!Number.isFinite(extraPerM2) || extraPerM2 < 0 || extraPerM2 > 1000) throw new Error("Ongeldige extra kosten.");
  return rows.flatMap(r => {
    const basisArea = positief(r.widthMm) && positief(r.heightMm) ? Number(r.widthMm) * Number(r.heightMm) / 1_000_000 : oppervlak(r.description);
    const basisPrijs = positief(r.price), basisKost = positief(r.cost);
    const matenBron = r.additionalSizes?.filter(a => a.label) ?? [];
    const maten = (matenBron.length ? matenBron : [{ sku: r.sku ?? undefined,
      label: basisArea && positief(r.widthMm) && positief(r.heightMm) ? `${Number(r.widthMm)}*${Number(r.heightMm)}` : r.description?.match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/)?.[0] ?? "",
      priceEur: basisPrijs, costEur: basisKost, inStock: Number(r.stockQty) > 0 }]).flatMap(a => {
      const areaM2 = oppervlak(a.label), zelfdeMaat = !!areaM2 && !!basisArea && Math.abs(areaM2 - basisArea) < 0.000001;
      const prijs = positief(a.priceEur) ?? (basisPrijs && basisArea && areaM2 ? basisPrijs * areaM2 / basisArea : null);
      const eigenKost = positief(a.costEur), basisVoorMaat = zelfdeMaat ? basisKost : null;
      const geregistreerdeKost = eigenKost || basisVoorMaat ? Math.max(eigenKost ?? 0, basisVoorMaat ?? 0) : null;
      const geraamdeKost = geregistreerdeKost ?? (basisKost && basisArea && areaM2 ? basisKost * areaM2 / basisArea : null);
      const kostenbron: Kostenbron = eigenKost && basisVoorMaat && Math.abs(eigenKost - basisVoorMaat) > .02 ? "conservatief" : eigenKost ? "maat" : basisVoorMaat ? "basis" : geraamdeKost ? "raming" : "ontbreekt";
      const extraKost = areaM2 ? extraPerM2 * areaM2 : 0;
      const kost = geregistreerdeKost && (extraPerM2 === 0 || areaM2) ? geregistreerdeKost + extraKost : null;
      const prijzen = distributeurPrijzen(prijs, kost, opties, r.vatRate);
      if (!prijzen) return [];
      return [{ ...prijzen, dim: maatLabel(a.label ?? ""), sku: a.sku ?? r.sku, areaM2,
        inStock: a.stockQty != null ? a.stockQty > 0 : Boolean(a.inStock), kostenbron, geregistreerdeKost, geraamdeKost, extraKost }];
    });
    maten.sort((a, b) => (a.areaM2 ?? 0) - (b.areaM2 ?? 0));
    return maten.length ? [{ id: r.id, groep: r.category || "Overige", naam: r.name, sku: r.sku, imageUrl: r.imageUrl, maten }] : [];
  });
}
