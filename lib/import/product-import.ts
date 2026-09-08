/**
 * De kern van de productimport: van geïmporteerde regels naar een plan.
 *
 * Bewust puur — geen database, geen bestanden — zodat het te testen is en zodat
 * er altijd eerst een DROOGLOOP getoond kan worden: hoeveel producten en
 * uitvoeringen zijn nieuw, wat verandert er precies, en welke codes botsen. Pas
 * daarna schrijft de aanroeper iets weg.
 *
 * Drie bronnen komen hier samen: het document van Nick, een latere datafeed van
 * de leverancier, en als terugval de catalogus-PDF's. Alle drie leveren
 * `ImportRow`s; de artikelcode is de sleutel waarop bijgewerkt wordt, zodat
 * dezelfde gegevens twee keer inladen niets dubbel maakt.
 */
import { buildVariantLabel, inkoopUitKorting, normalizeCode } from "@/lib/variants";

/** Eén regel uit het bronbestand: één verkoopbaar artikel. */
export type ImportRow = {
  /** Artikelcode van de leverancier. De sleutel van alles. */
  code: string;
  /** Naam van het model, gelijk voor alle uitvoeringen ervan. */
  productName: string;
  /** Serie (Edition, Carving, Stripe) — hoort bij de identiteit van het product. */
  series?: string | null;
  collection?: string | null;
  category?: string | null;
  unit?: string | null;
  /** De keuze per as: { Kleur: "Chroom", Hoofddouche: "20 cm" }. */
  options: Record<string, string>;
  /** Adviesverkoopprijs ex btw. */
  listPriceEur?: number | null;
  /** Inkoopkorting in procenten; leeg = die van het merk. */
  discountPct?: number | null;
  /** Inkoopprijs ex btw; wint van de berekening uit de korting. */
  purchaseEur?: number | null;
  imageUrl?: string | null;
  sourceRef?: string | null;
};

/** Een uitvoering zoals die nu in de database staat. */
export type BestaandeVariant = {
  code: string;
  productId: string;
  priceEur: number | null;
  purchaseCostEur: number | null;
  label: string;
  imageUrl: string | null;
};

export type GeplandProduct = {
  /** Stabiele sleutel: serie + naam. */
  sleutel: string;
  name: string;
  sku: string;
  collection: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string | null;
  optionAxes: Array<{ key: string; label: string; values: Array<{ value: string; label: string }> }>;
  varianten: GeplandeVariant[];
};

export type GeplandeVariant = {
  code: string;
  label: string;
  options: Record<string, string>;
  priceEur: number | null;
  listPriceEur: number | null;
  discountPct: number | null;
  purchaseCostEur: number | null;
  imageUrl: string | null;
  sourceRef: string | null;
  sortOrder: number;
};

export type ImportPlan = {
  producten: GeplandProduct[];
  nieuweUitvoeringen: number;
  bijgewerkteUitvoeringen: number;
  ongewijzigdeUitvoeringen: number;
  /** Regels die niet verwerkt worden, met de reden. */
  conflicten: Array<{ code: string; reden: string }>;
  /** Wat er verandert aan bestaande uitvoeringen — het bewijs voor de droogloop. */
  wijzigingen: Array<{ code: string; veld: string; oud: string; nieuw: string }>;
  /** Regels zonder prijs of zonder keuzes: gaan er wel in, maar het is het melden waard. */
  waarschuwingen: string[];
};

const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Korte, stabiele vingerafdruk zodat een afgekapte code toch uniek blijft. */
function vingerafdruk(t: string): string {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().slice(0, 4).padStart(4, "0");
}

/**
 * De productcode van het model zelf. Moet stabiel zijn over herhaalde imports
 * heen (anders ontstaat er bij elke run een nieuw product) en uniek genoeg om
 * niet met een ander model te botsen — vandaar de vingerafdruk achteraan.
 */
export function productSku(prefix: string, series: string | null | undefined, naam: string): string {
  const basis = [series, naam].filter(Boolean).join(" ");
  const kort = slug(basis).slice(0, 40).replace(/-+$/, "");
  return `${prefix}-${kort}-${vingerafdruk(basis)}`;
}

const bijnaGelijk = (a: number | null, b: number | null) =>
  a == null && b == null ? true : a != null && b != null && Math.abs(a - b) < 0.005;

/**
 * De regels ordenen tot producten met hun uitvoeringen, en vergelijken met wat
 * er al staat.
 *
 * Regels die hier gelden:
 *  - een lege prijs laat de bestaande prijs staan; alleen een ingevulde waarde
 *    verandert iets. Zo kan een bestand met alleen nieuwe foto's geen prijzen
 *    wissen;
 *  - dezelfde code twee keer in één bestand is een conflict, geen "laatste
 *    wint" — dat is een typefout die je wilt zien;
 *  - een code die al bij een ánder product hoort wordt nooit stil verplaatst;
 *  - alleen assen die écht variëren binnen een product worden een keuze.
 */
export function planImport(
  rows: ImportRow[],
  bestaand: Map<string, BestaandeVariant>,
  opties: { skuPrefix: string; dealerDiscountPct?: number | null },
): ImportPlan {
  const conflicten: ImportPlan["conflicten"] = [];
  const waarschuwingen: string[] = [];
  const wijzigingen: ImportPlan["wijzigingen"] = [];

  // Dubbele codes binnen het bestand eruit halen vóór er iets gebeurt.
  const perCode = new Map<string, ImportRow[]>();
  for (const rij of rows) {
    const code = normalizeCode(rij.code);
    if (!code) {
      conflicten.push({ code: "(leeg)", reden: "regel zonder artikelcode" });
      continue;
    }
    perCode.set(code, [...(perCode.get(code) ?? []), rij]);
  }
  const bruikbaar: Array<ImportRow & { code: string }> = [];
  for (const [code, groep] of perCode) {
    if (groep.length > 1) {
      const uniek = new Set(groep.map((g) => `${g.productName}|${g.series ?? ""}|${g.listPriceEur ?? ""}`));
      if (uniek.size > 1) {
        conflicten.push({ code, reden: `${groep.length}× in het bestand, met verschillende gegevens` });
        continue;
      }
      waarschuwingen.push(`${code} staat ${groep.length}× in het bestand met dezelfde gegevens — één gebruikt`);
    }
    bruikbaar.push({ ...groep[0], code });
  }

  // Groeperen op serie + modelnaam: dat is één product.
  const groepen = new Map<string, Array<ImportRow & { code: string }>>();
  for (const rij of bruikbaar) {
    const sleutel = [rij.series ?? "", rij.productName].join("|");
    groepen.set(sleutel, [...(groepen.get(sleutel) ?? []), rij]);
  }

  const producten: GeplandProduct[] = [];
  let nieuw = 0;
  let bijgewerkt = 0;
  let ongewijzigd = 0;

  for (const [sleutel, groep] of groepen) {
    const eerste = groep[0];
    const naam = [eerste.series, eerste.productName].filter(Boolean).join(" ");

    // Alleen assen die binnen dit product verschillen zijn een keuze. Een
    // keuzelijst met één optie is geen keuze maar ruis.
    const perAs = new Map<string, Set<string>>();
    for (const rij of groep) {
      for (const [as, waarde] of Object.entries(rij.options)) {
        if (!waarde) continue;
        perAs.set(as, (perAs.get(as) ?? new Set()).add(waarde));
      }
    }
    const assen = [...perAs.entries()]
      .filter(([, waarden]) => waarden.size > 1)
      .map(([as, waarden]) => ({
        key: slug(as).toLowerCase().replace(/-/g, ""),
        label: as,
        values: [...waarden].sort((a, b) => a.localeCompare(b, "nl", { numeric: true })).map((w) => ({
          value: w,
          label: w,
        })),
      }));

    const varianten: GeplandeVariant[] = groep.map((rij, i) => {
      const keuze: Record<string, string> = {};
      for (const as of assen) {
        const waarde = rij.options[as.label];
        if (waarde) keuze[as.key] = waarde;
      }
      const korting = rij.discountPct ?? opties.dealerDiscountPct ?? null;
      // Zonder bekende korting blijft de inkoopprijs leeg. Hem gelijkstellen aan
      // de adviesprijs zou overal 0% marge tonen, en dat leest als een feit.
      const inkoop =
        rij.purchaseEur ?? (korting != null ? inkoopUitKorting(rij.listPriceEur ?? null, korting) : null);
      return {
        code: rij.code,
        label: buildVariantLabel(assen, keuze) || rij.code,
        options: keuze,
        priceEur: rij.listPriceEur ?? null,
        listPriceEur: rij.listPriceEur ?? null,
        discountPct: korting,
        purchaseCostEur: inkoop,
        imageUrl: rij.imageUrl ?? null,
        sourceRef: rij.sourceRef ?? null,
        sortOrder: i,
      };
    });

    if (!varianten.some((v) => v.priceEur != null)) {
      waarschuwingen.push(`${naam}: geen enkele uitvoering heeft een prijs`);
    }

    producten.push({
      sleutel,
      name: naam,
      sku: productSku(opties.skuPrefix, eerste.series, eerste.productName),
      collection: eerste.collection ?? null,
      category: eerste.category ?? null,
      subcategory: eerste.series ?? null,
      unit: eerste.unit ?? null,
      optionAxes: assen,
      varianten,
    });

    // Vergelijken met wat er staat.
    for (const v of varianten) {
      const oud = bestaand.get(v.code);
      if (!oud) {
        nieuw++;
        continue;
      }
      const verschillen: Array<[string, string, string]> = [];
      if (v.priceEur != null && !bijnaGelijk(oud.priceEur, v.priceEur)) {
        verschillen.push(["verkoopprijs", String(oud.priceEur ?? "—"), String(v.priceEur)]);
      }
      if (v.purchaseCostEur != null && !bijnaGelijk(oud.purchaseCostEur, v.purchaseCostEur)) {
        verschillen.push(["inkoopprijs", String(oud.purchaseCostEur ?? "—"), String(v.purchaseCostEur)]);
      }
      if (v.label !== oud.label) verschillen.push(["omschrijving", oud.label, v.label]);
      if (v.imageUrl && v.imageUrl !== oud.imageUrl) {
        verschillen.push(["foto", oud.imageUrl ?? "—", v.imageUrl]);
      }
      if (verschillen.length === 0) {
        ongewijzigd++;
        continue;
      }
      bijgewerkt++;
      for (const [veld, o, n] of verschillen) wijzigingen.push({ code: v.code, veld, oud: o, nieuw: n });
    }
  }

  return {
    producten,
    nieuweUitvoeringen: nieuw,
    bijgewerkteUitvoeringen: bijgewerkt,
    ongewijzigdeUitvoeringen: ongewijzigd,
    conflicten,
    wijzigingen,
    waarschuwingen,
  };
}
