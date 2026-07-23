/* Gedeelde data-laag voor de Flexibel Stone groothandels-prijsbrochure.
   Gebruikt door zowel het CLI-script als de CRM-download-route.

   Prijsregels (afgesproken 21-07-2026):
   - kostprijs   = inkoop × 1,55   (+15% handling +40% invoer)
   - jouw inkoop = kostprijs × 2, met een ondergrens van 45% van de advies,
                   netjes afgerond op € 0,50. De ondergrens tilt goedkoop-te-maken
                   panelen omhoog; dure blijven op kostprijs × 2.
   - advies      = consumentenprijs (ex btw) + incl btw

   Elk paneel heeft één of meer maten (additionalSizes). Per maat rekenen we de
   inkoop consistent door op de inkoopprijs/m² van het paneel, zodat elke maat een
   eigen prijs krijgt en de €/m² klopt. Panelen zonder bekende inkoopprijs tonen
   "op aanvraag" (de adviesprijs is wél bekend). */
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import type { WholesaleBrochureMeta, WholesaleItem, WholesaleSize } from "@/lib/wholesale-brochure-pdf";

export const WHOLESALE_MULTIPLIER = 2; // kostprijs → jouw inkoop
export const COST_MULTIPLIER = 1.55; // inkoop → kostprijs
export const ADVIES_FLOOR_PCT = 0.45; // inkoop nooit onder 45% van de advies
const VAT = 1.21;

const r2 = (n: number) => Math.round(n * 100) / 100;
const round50 = (n: number) => Math.round(n * 2) / 2; // afronden op € 0,50

/** Oppervlak (m²) uit een "1200*600" / "1200 x 600" label. */
function areaFromLabel(label: string | null | undefined): number | null {
  const m = String(label ?? "").match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/i);
  return m ? (Number(m[1]) * Number(m[2])) / 1_000_000 : null;
}
/** "1200*600" → "1200 × 600 mm" (grootste zijde eerst); laat andere labels heel. */
function fmtLabel(label: string | null | undefined): string {
  const s = String(label ?? "").trim();
  const m = s.match(/^(\d{2,4})\s*[*x×]\s*(\d{2,4})(?:\s*mm)?$/i);
  if (!m) return s;
  const [a, b] = [Math.max(+m[1], +m[2]), Math.min(+m[1], +m[2])];
  return `${a} × ${b} mm`;
}

type AddlSize = {
  sku?: string;
  label?: string;
  priceEur?: number;
  purchaseEur?: number;
  costEur?: number;
  inStock?: boolean;
};

/**
 * Bouw de brochure-items voor een serie (`category`) of de hele
 * Wandpanelen-collectie (`category` leeg of "ALL").
 */
export async function buildWholesaleItems(categoryArg?: string): Promise<{
  items: WholesaleItem[];
  meta: WholesaleBrochureMeta;
  total: number;
  zonderInkoop: number;
}> {
  const all = !categoryArg || categoryArg.toUpperCase() === "ALL";
  const rows = await db
    .select({
      name: products.name,
      sku: products.sku,
      category: products.category,
      imageUrl: products.imageUrl,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      additionalSizes: products.additionalSizes,
      description: products.description,
      cost: products.costEur,
      purchase: products.purchaseCostEur,
      price: products.priceEur,
    })
    .from(products)
    .where(
      and(
        eq(products.collection, "Wandpanelen"),
        eq(products.isActive, true),
        // Alleen panelen met bekende kostprijs (voorraad); de rest laten we weg.
        isNotNull(products.costEur),
        gt(products.costEur, "0"),
        // Én met een verkoopprijs (advies) — weert rommelrecords zonder prijs.
        isNotNull(products.priceEur),
        gt(products.priceEur, "0"),
        // Én met een SKU — weert losse voorraad-/dubbelrecords zonder artikelnummer.
        isNotNull(products.sku),
        ...(all ? [] : [eq(products.category, categoryArg!)]),
      ),
    )
    .orderBy(asc(products.category), asc(products.name));

  let zonderInkoop = 0;
  const items: WholesaleItem[] = rows.map((r) => {
    const basePrice = Number(r.price) || 0;
    const baseCost = Number(r.cost) || 0;
    const basePurchase = Number(r.purchase) || (baseCost > 0 ? baseCost / COST_MULTIPLIER : 0);
    const baseArea =
      Number(r.widthMm) > 0 && Number(r.heightMm) > 0
        ? (Number(r.widthMm) * Number(r.heightMm)) / 1_000_000
        : areaFromLabel(r.description);

    const addl = (Array.isArray(r.additionalSizes) ? (r.additionalSizes as AddlSize[]) : []).filter((x) => x?.label);

    // Inkoopprijs per m² van dit paneel: uit de basis-inkoop, of uit een maat met
    // eigen inkoopprijs. Basis om elke maat consistent door te rekenen.
    let perM2: number | null = basePurchase > 0 && baseArea ? basePurchase / baseArea : null;
    if (perM2 == null) {
      for (const a of addl) {
        const ar = areaFromLabel(a.label);
        if (a.purchaseEur != null && ar) {
          perM2 = a.purchaseEur / ar;
          break;
        }
      }
    }
    // Advies per m² (voor maten zonder eigen verkoopprijs).
    const advPerM2 = basePrice > 0 && baseArea ? basePrice / baseArea : null;

    const mkSize = (label: string, sku: string | null, price: number | null, purchase: number | null, inStock: boolean): WholesaleSize => {
      const areaM2 = areaFromLabel(label);
      const pur = purchase ?? (perM2 != null && areaM2 ? perM2 * areaM2 : null);
      // Ongeronde adviesprijs (uit de eigen verkoopprijs, of via de m²-prijs).
      const rawAdvies = price != null && price > 0 ? price : advPerM2 != null && areaM2 ? advPerM2 * areaM2 : null;
      const adviesEx = rawAdvies != null ? r2(rawAdvies) : null;
      // Inkoop = kostprijs × 2, met ondergrens 45% van de advies, afgerond op € 0,50.
      const inkoopCost = pur != null ? pur * COST_MULTIPLIER * WHOLESALE_MULTIPLIER : null;
      const floor = rawAdvies != null ? rawAdvies * ADVIES_FLOOR_PCT : null;
      const inkoopRaw = inkoopCost != null ? Math.max(inkoopCost, floor ?? 0) : floor;
      const inkoop = inkoopRaw != null ? round50(inkoopRaw) : null;
      return {
        dim: fmtLabel(label),
        sku,
        areaM2,
        inkoop,
        adviesEx,
        adviesIncl: rawAdvies != null ? r2(rawAdvies * VAT) : null,
        inStock,
      };
    };

    let sizes: WholesaleSize[];
    if (addl.length) {
      sizes = addl.map((a) => mkSize(a.label!, a.sku ?? null, a.priceEur ?? null, a.purchaseEur ?? null, Boolean(a.inStock)));
    } else {
      // Eén maat: uit de basisafmeting.
      const label =
        Number(r.widthMm) > 0 && Number(r.heightMm) > 0
          ? `${Math.max(Number(r.widthMm), Number(r.heightMm))}*${Math.min(Number(r.widthMm), Number(r.heightMm))}`
          : (r.description?.match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/)?.[0] ?? "");
      sizes = [mkSize(label, r.sku ?? null, basePrice || null, basePurchase || null, true)];
    }
    // Klein → groot, zodat de goedkoopste maat bovenaan staat.
    sizes.sort((a, b) => (a.areaM2 ?? 0) - (b.areaM2 ?? 0));

    const hasInkoop = sizes.some((sz) => sz.inkoop != null);
    if (!hasInkoop) zonderInkoop++;

    return {
      group: r.category || "Overige",
      name: r.name,
      sku: r.sku,
      imageUrl: r.imageUrl,
      sizes,
      hasInkoop,
    };
  });

  return {
    items,
    meta: { subtitle: all ? "Volledige collectie" : categoryArg!, wholesaleMultiplier: WHOLESALE_MULTIPLIER },
    total: rows.length,
    zonderInkoop,
  };
}
