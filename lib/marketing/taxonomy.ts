/**
 * Marketingtaxonomie — de gecureerde menu-indeling van habitat-one.com
 * (besluit operator/coördinator): "categorie" in de marketingmodule is de
 * website-menu-indeling, NIET `products.category` (dat zijn families als
 * "Age Stone") en ook niet `catalog_collections.category` (te dun).
 *
 * Twee lagen, als data:
 *  1. `TAXONOMY` — groepen + subcategorieën, exact zoals het websitemenu
 *  2. `FAMILY_TO_SUBCATEGORY` + `FAMILY_KEYWORD_RULES` — mapping van
 *     productfamilies naar een subcategorie, met "Overig" als vangnet
 *
 * `unmappedFamilies` signaleert families die nog nergens landen — de test in
 * __tests__/taxonomy.test.ts bewaakt bovendien dat elke mapping naar een
 * bestaande subcategorie wijst. Puur data + functies: client-safe; de
 * editor-picker (U2), de modal-groepering (U6) en de bibliotheek (B1)
 * draaien allemaal op dit ene bestand.
 */

export interface TaxonomyGroup {
  group: string;
  subcategories: string[];
}

/** Het websitemenu, letterlijk. Groepen zonder submenu zijn hun eigen subcategorie. */
export const TAXONOMY: TaxonomyGroup[] = [
  {
    group: "Surfaces & Walls",
    subcategories: ["Flexible Stone", "Acrylic panels", "XPS Backer Boards"],
  },
  { group: "Flooring", subcategories: ["PVC Flooring"] },
  { group: "Bathroom", subcategories: ["Bathroom", "Accessories"] },
  {
    group: "Heating & Lighting",
    subcategories: ["Fireplaces", "Lighting", "Switches & sockets"],
  },
  { group: "Garden", subcategories: ["Flower Pots"] },
  { group: "Doors", subcategories: ["Doors"] },
  { group: "Furniture", subcategories: ["Furniture"] },
];

/** Vangnet voor families die (nog) nergens gemapt zijn. */
export const OVERIG = "Overig";

/** Alle subcategorieën in menuvolgorde (zonder het vangnet). */
export function allSubcategories(): string[] {
  return TAXONOMY.flatMap((g) => g.subcategories);
}

/** Menugroep bij een subcategorie; "Overig" voor onbekende waarden. */
export function groupForSubcategory(subcategory: string): string {
  return TAXONOMY.find((g) => g.subcategories.includes(subcategory))?.group ?? OVERIG;
}

/**
 * Expliciete mapping productfamilie → subcategorie. Alleen families die niet
 * door de keyword-regels hieronder worden gevangen hoeven hier te staan.
 */
export const FAMILY_TO_SUBCATEGORY: Record<string, string> = {
  // Meubels
  Seating: "Furniture",
  Tables: "Furniture",
  Storage: "Furniture",
  Beds: "Furniture",
  Loungers: "Furniture",
  Decoration: "Furniture",
  // Verlichting & elektra
  "Magnetic Track": "Lighting",
  "Rail-verlichting": "Lighting",
  "LED-strips": "Lighting",
  Grondspots: "Lighting",
  Wandspots: "Lighting",
  Lighting: "Lighting",
  "Schakelaars, stopcontacten & dimmers": "Switches & sockets",
  // Haarden
  Waterdamphaard: "Fireplaces",
  // Vloeren
  "PVC Vloeren": "PVC Flooring",
  // Platen
  "XPS montageplaten": "XPS Backer Boards",
  "Solid surface platen": "Acrylic panels",
  // Badkamer — sanitair
  Wastafels: "Bathroom",
  Toiletten: "Bathroom",
  Douchebakken: "Bathroom",
  Douchewanden: "Bathroom",
  Douchesets: "Bathroom",
  Baden: "Bathroom",
  Kranen: "Bathroom",
  Afvoeren: "Bathroom",
  Spiegels: "Bathroom",
  // Badkamer — accessoires
  Toiletaccessoires: "Accessories",
  Badrekken: "Accessories",
  Handdoekrekken: "Accessories",
  Handdoekstangen: "Accessories",
  // Deuren
  Binnendeuren: "Doors",
  Buitendeuren: "Doors",
  Beslag: "Doors",
};

/**
 * Keyword-regels voor de lange staart van steen-/plaatfamilies ("Age Stone",
 * "Danxia Rammed Earth Board", "Italian Travertine", …): één woordmatch en de
 * familie valt in de subcategorie. Expliciete mapping hierboven wint altijd.
 */
export const FAMILY_KEYWORD_RULES: Array<{ keywords: string[]; subcategory: string }> = [
  {
    keywords: [
      "stone",
      "travertine",
      "travertino",
      "board",
      "marble",
      "slate",
      "limestone",
      "lime stone",
      "dacite",
      "terrazzo",
      "granite",
      "pillar",
      "mosaic",
      "cement",
      "brick",
      "weaving",
      "woven",
      "romanite",
      "morocco",
      "epocco",
      "aerolite",
      "wood fence",
      "pine wood",
      "rusty red",
      "gold sand",
      "golden",
      "cloud-dragon",
      "dunhuang",
      "moonscape",
      "skyline",
    ],
    subcategory: "Flexible Stone",
  },
];

/** Subcategorie voor een productfamilie; "Overig" als niets past. */
export function subcategoryForFamily(family: string | null | undefined): string {
  if (!family) return OVERIG;
  const explicit = FAMILY_TO_SUBCATEGORY[family];
  if (explicit) return explicit;
  const lower = family.toLowerCase();
  for (const rule of FAMILY_KEYWORD_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.subcategory;
  }
  return OVERIG;
}

/** Welke families landen nog in "Overig"? (Signaal om de mapping aan te vullen.) */
export function unmappedFamilies(families: Array<string | null | undefined>): string[] {
  return [...new Set(families.filter((f): f is string => !!f))]
    .filter((f) => subcategoryForFamily(f) === OVERIG)
    .sort((a, b) => a.localeCompare(b, "nl"));
}
