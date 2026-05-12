/** Line-item categories and their default Spanish IVA rate. Editable per line. */
export const LINE_CATEGORIES = [
  { value: "materiaal", label: "Materiaal / levering", vat: 21 },
  { value: "renovatie", label: "Renovatie / verbouwing", vat: 10 },
  { value: "arbeid", label: "Arbeid / uitvoering", vat: 10 },
  { value: "plaatsing", label: "Plaatsing / montage", vat: 10 },
  { value: "ontwerp", label: "Ontwerp / advies", vat: 21 },
  { value: "transport", label: "Transport / logistiek", vat: 21 },
  { value: "overig", label: "Overig", vat: 21 },
] as const;

export type LineCategory = (typeof LINE_CATEGORIES)[number]["value"];

export const LINE_CATEGORY_VALUES = LINE_CATEGORIES.map((c) => c.value) as readonly string[];

export function vatForCategory(category: string | null | undefined): number {
  return LINE_CATEGORIES.find((c) => c.value === category)?.vat ?? 21;
}

export function labelForCategory(category: string | null | undefined): string {
  return LINE_CATEGORIES.find((c) => c.value === category)?.label ?? category ?? "—";
}

/** Common product units (free text allowed too). */
export const PRODUCT_UNITS = ["stuk", "m²", "m", "m³", "kg", "uur", "dag", "pakket", "set"];
