/**
 * Uitvoeringen van een product (kleur, model, maat) — de rekenkant.
 *
 * Een merkproduct staat één keer in de lijst en heeft daaronder zijn
 * uitvoeringen, elk met een eigen leverancierscode, prijs en foto. De tabel
 * `product_variants` is daarvan de bron; `products.additionalSizes` is de
 * afgeleide weergave die de rest van het CRM al leest (de maatkiezer op de
 * offerteregel, /bestellen, /scan, de prijslijst-PDF, de portal-prijzen voor de
 * website). Alles hier is puur, zodat het te testen is zonder database.
 */
import type { ProductOptionAxis, ProductSizeRow } from "@/lib/db/schema";

/** Numeriek veld uit Drizzle (numeric = string) of uit een formulier. */
type Getal = string | number | null | undefined;

function num(v: Getal): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Leverancierscodes uit een catalogus, een spreadsheet en een feed zien er net
 * anders uit ("5-ce-001", " 5 - CE - 001 "). Eén normaalvorm, zodat de unieke
 * index op (merk, code) doet wat hij belooft en een herhaalde import niets
 * dubbel maakt.
 */
export function normalizeCode(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s*-\s*/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ");
}

/** Onze eigen code: het merkvoorvoegsel vóór de leverancierscode. */
export function buildVariantSku(skuPrefix: string | null | undefined, code: string): string {
  const c = normalizeCode(code);
  const p = String(skuPrefix ?? "").trim().toUpperCase().replace(/-+$/, "");
  if (!p) return c;
  return c.startsWith(`${p}-`) ? c : `${p}-${c}`;
}

/** Het leesbare label van één aswaarde; onbekende waarden tonen zichzelf. */
export function axisValueLabel(axis: ProductOptionAxis, value: string): string {
  return axis.values.find((v) => v.value === value)?.label ?? value;
}

/**
 * "Gunmetal · Hendel E" — in de volgorde van de assen, niet in de volgorde
 * waarin de sleutels toevallig in het object staan. Assen zonder keuze worden
 * overgeslagen, zodat een half ingevulde rij geen rare scheidingstekens krijgt.
 */
export function buildVariantLabel(
  axes: ProductOptionAxis[] | null | undefined,
  options: Record<string, string> | null | undefined,
): string {
  if (!axes?.length || !options) return "";
  return axes
    .map((axis) => {
      const gekozen = options[axis.key];
      return gekozen ? axisValueLabel(axis, gekozen) : null;
    })
    .filter((v): v is string => !!v)
    .join(" · ");
}

/** Klopt de keuze met de assen van het product? Lege lijst = in orde. */
export function optionProblems(
  axes: ProductOptionAxis[] | null | undefined,
  options: Record<string, string> | null | undefined,
): string[] {
  const problemen: string[] = [];
  const bekend = new Map((axes ?? []).map((a) => [a.key, a]));
  for (const [key, value] of Object.entries(options ?? {})) {
    const axis = bekend.get(key);
    if (!axis) {
      problemen.push(`onbekende optie "${key}"`);
      continue;
    }
    if (!axis.values.some((v) => v.value === value)) {
      problemen.push(`"${value}" is geen waarde van ${axis.label}`);
    }
  }
  return problemen;
}

/** Alle combinaties van de assen — het voorstel voor de matrix-editor. */
export function axisCombinations(axes: ProductOptionAxis[]): Array<Record<string, string>> {
  return axes.reduce<Array<Record<string, string>>>(
    (acc, axis) =>
      axis.values.length === 0
        ? acc
        : acc.flatMap((rij) => axis.values.map((v) => ({ ...rij, [axis.key]: v.value }))),
    [{}],
  );
}

export type VariantVoorProjectie = {
  code: string;
  sku?: string | null;
  label?: string | null;
  options?: Record<string, string> | null;
  priceEur?: Getal;
  purchaseCostEur?: Getal;
  costEur?: Getal;
  stockQty?: Getal;
  imageUrl?: string | null;
  isActive?: boolean | null;
  sortOrder?: number | null;
};

/**
 * De uitvoeringen omzetten naar `products.additionalSizes`.
 *
 * Twee dingen zijn hier niet vrijblijvend:
 *  - de bestaande sleutels (sku, label, priceEur, purchaseEur, costEur,
 *    stockQty, inStock) houden exact hun betekenis — er lezen ~40 plekken mee,
 *    en lib/website/push.ts zet het veld ongezien door naar de website;
 *  - labels moeten uniek zijn. `app/(app)/bestellen/actions.ts` zoekt een
 *    uitvoering óp zijn label; twee keer "Mat zwart" zou de verkeerde regel
 *    bestellen. Bij een botsing komt de code erachter.
 */
export function toAdditionalSizes(variants: VariantVoorProjectie[]): ProductSizeRow[] {
  const actief = variants
    .filter((v) => v.isActive !== false)
    .slice()
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        String(a.label ?? "").localeCompare(String(b.label ?? ""), "nl") ||
        normalizeCode(a.code).localeCompare(normalizeCode(b.code)),
    );

  const aantalPerLabel = new Map<string, number>();
  for (const v of actief) {
    const l = (v.label ?? "").trim();
    aantalPerLabel.set(l, (aantalPerLabel.get(l) ?? 0) + 1);
  }

  return actief.map((v) => {
    const code = normalizeCode(v.code);
    const basis = (v.label ?? "").trim();
    const uniek = !basis || (aantalPerLabel.get(basis) ?? 0) > 1;
    const stock = num(v.stockQty);
    return {
      sku: v.sku?.trim() || code,
      label: uniek ? [basis, code].filter(Boolean).join(" · ") : basis,
      priceEur: num(v.priceEur),
      purchaseEur: num(v.purchaseCostEur),
      costEur: num(v.costEur),
      stockQty: stock,
      inStock: (stock ?? 0) > 0,
      code,
      imageUrl: v.imageUrl ?? null,
      options: v.options ?? null,
    };
  });
}

/**
 * Inkoopprijs uit adviesprijs en korting. Op hele centen, want dit bedrag gaat
 * één op één de marge-berekening in.
 */
export function inkoopUitKorting(adviesprijs: Getal, kortingPct: Getal): number | null {
  const advies = num(adviesprijs);
  const korting = num(kortingPct);
  if (advies == null) return null;
  if (korting == null) return Math.round(advies * 100) / 100;
  return Math.round(advies * (1 - korting / 100) * 100) / 100;
}
