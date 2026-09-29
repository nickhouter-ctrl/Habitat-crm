import "server-only";

/**
 * De panelen voor de distributeurprijslijst uit de database halen.
 *
 * Alleen Flexibel Stone (de collectie "Wandpanelen"), alleen wat actief is en
 * een adviesprijs heeft — die prijs is hier het anker: de distributeurprijs is
 * er een vast deel van (zie `lib/distributeur-prijzen.ts`). Een inkoopprijs is
 * hier niet nodig, en dat scheelt: panelen zonder bekende inkoop staan wél in
 * deze lijst, terwijl de groothandelsbrochure ze moet overslaan.
 *
 * Per paneel elke maat apart. Heeft een maat geen eigen prijs, dan rekenen we
 * hem door op de prijs per m² van het paneel.
 */
import { and, asc, eq, gt, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { distributeurPrijzen, type Distributeurprijs } from "@/lib/distributeur-prijzen";

export interface DistributeurMaat extends Distributeurprijs {
  /** "1200 × 600 mm" */
  dim: string;
  sku: string | null;
  areaM2: number | null;
  inStock: boolean;
}

export interface DistributeurItem {
  /** De serie, bijvoorbeeld "Italian Travertine". */
  groep: string;
  naam: string;
  sku: string | null;
  imageUrl: string | null;
  maten: DistributeurMaat[];
}

type AddlSize = {
  sku?: string;
  label?: string;
  priceEur?: number;
  inStock?: boolean;
};

/** Oppervlak (m²) uit een "1200*600" / "1200 x 600" label. */
function oppervlak(label: string | null | undefined): number | null {
  const m = String(label ?? "").match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/i);
  return m ? (Number(m[1]) * Number(m[2])) / 1_000_000 : null;
}

/** "1200*600" → "1200 × 600 mm" (grootste zijde eerst); andere labels blijven heel. */
function maatLabel(label: string | null | undefined): string {
  const s = String(label ?? "").trim();
  const m = s.match(/^(\d{2,4})\s*[*x×]\s*(\d{2,4})(?:\s*mm)?$/i);
  if (!m) return s;
  const [a, b] = [Math.max(+m[1], +m[2]), Math.min(+m[1], +m[2])];
  return `${a} × ${b} mm`;
}

export async function buildDistributeurItems(serie?: string): Promise<{
  items: DistributeurItem[];
  series: string[];
  totaal: number;
}> {
  const alles = !serie || serie.toUpperCase() === "ALL";
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
      price: products.priceEur,
    })
    .from(products)
    .where(
      and(
        eq(products.collection, "Wandpanelen"),
        eq(products.isActive, true),
        isNotNull(products.priceEur),
        gt(products.priceEur, "0"),
        isNotNull(products.sku),
        ...(alles ? [] : [eq(products.category, serie!)]),
      ),
    )
    .orderBy(asc(products.category), asc(products.name));

  const items: DistributeurItem[] = [];
  for (const r of rows) {
    const basisPrijs = Number(r.price) || 0;
    const basisOppervlak =
      Number(r.widthMm) > 0 && Number(r.heightMm) > 0
        ? (Number(r.widthMm) * Number(r.heightMm)) / 1_000_000
        : oppervlak(r.description);
    // Adviesprijs per m², om maten zonder eigen prijs door te rekenen.
    const perM2 = basisPrijs > 0 && basisOppervlak ? basisPrijs / basisOppervlak : null;

    const maakMaat = (label: string, sku: string | null, prijs: number | null, inStock: boolean): DistributeurMaat | null => {
      const areaM2 = oppervlak(label);
      const advies = prijs && prijs > 0 ? prijs : perM2 != null && areaM2 ? perM2 * areaM2 : null;
      const prijzen = distributeurPrijzen(advies);
      if (!prijzen) return null;
      return { dim: maatLabel(label), sku, areaM2, inStock, ...prijzen };
    };

    const addl = (Array.isArray(r.additionalSizes) ? (r.additionalSizes as AddlSize[]) : []).filter((x) => x?.label);
    const maten = (
      addl.length
        ? addl.map((a) => maakMaat(a.label!, a.sku ?? null, a.priceEur ?? null, Boolean(a.inStock)))
        : [
            maakMaat(
              Number(r.widthMm) > 0 && Number(r.heightMm) > 0
                ? `${Math.max(Number(r.widthMm), Number(r.heightMm))}*${Math.min(Number(r.widthMm), Number(r.heightMm))}`
                : (r.description?.match(/(\d{2,4})\s*[*x×]\s*(\d{2,4})/)?.[0] ?? ""),
              r.sku ?? null,
              basisPrijs || null,
              true,
            ),
          ]
    ).filter((m): m is DistributeurMaat => m !== null);

    if (!maten.length) continue;
    // Klein → groot, zodat de goedkoopste maat bovenaan staat.
    maten.sort((a, b) => (a.areaM2 ?? 0) - (b.areaM2 ?? 0));
    items.push({
      groep: r.category || "Overige",
      naam: r.name,
      sku: r.sku,
      imageUrl: r.imageUrl,
      maten,
    });
  }

  const series = [...new Set(items.map((i) => i.groep))].sort((a, b) => a.localeCompare(b, "nl"));
  return { items, series, totaal: items.length };
}
