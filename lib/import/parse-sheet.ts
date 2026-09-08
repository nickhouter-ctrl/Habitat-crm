/**
 * Een CSV of XLSX omzetten naar `ImportRow`s.
 *
 * De vaste kolommen worden op naam herkend, met synoniemen, zodat het bestand
 * van de leverancier en dat van ons allebei werken. **Elke kolom die niet
 * herkend wordt, wordt een keuze-as** — zo krijgt een doucheset zijn eigen
 * keuzes (Hoofddouche, Glijstang) zonder dat daar code voor nodig is, en een
 * meubel de zijne (Maat).
 */
import type { ImportRow } from "@/lib/import/product-import";

const SYNONIEMEN: Record<string, string[]> = {
  code: ["artikelcode", "artikelnummer", "sku", "code", "item no", "itemno", "art.nr", "artnr"],
  productName: ["model", "productnaam", "naam", "product", "omschrijving model"],
  series: ["serie", "series", "collectie"],
  collection: ["collection", "hoofdgroep"],
  category: ["categorie", "category", "hoofdstuk", "productgroep"],
  unit: ["eenheid", "unit"],
  listPriceEur: ["adviesprijs_excl", "adviesprijs", "verkoopprijs", "prijs", "price", "adviesverkoopprijs"],
  discountPct: ["dealerkorting_pct", "korting", "korting_pct", "dealerkorting"],
  purchaseEur: ["inkoop_excl", "inkoopprijs", "inkoop", "netto", "nettoprijs"],
  imageUrl: ["afbeelding_url", "afbeelding", "foto", "image", "image_url"],
  sourceRef: ["bron", "source"],
};

const normaliseer = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

/** Kolomkop → vast veld, of null als het een keuze-as is. */
function veldVan(kop: string): string | null {
  const k = normaliseer(kop);
  for (const [veld, namen] of Object.entries(SYNONIEMEN)) {
    if (namen.includes(k)) return veld;
  }
  return null;
}

/**
 * "1.234,56", "1234.56" en "€ 218,90" zijn alle drie hetzelfde bedrag. De
 * komma wint als scheidingsteken zodra er ook punten staan (Nederlandse
 * notatie), anders telt de punt als decimaal.
 */
export function leesBedrag(ruw: string | number | null | undefined): number | null {
  if (ruw == null || ruw === "") return null;
  if (typeof ruw === "number") return Number.isFinite(ruw) ? ruw : null;
  let t = String(ruw).replace(/[€\s]/g, "").trim();
  if (!t) return null;
  const heeftKomma = t.includes(",");
  const heeftPunt = t.includes(".");
  if (heeftKomma && heeftPunt) t = t.replace(/\./g, "").replace(",", ".");
  else if (heeftKomma) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Eén regel CSV opsplitsen, met aanhalingstekens en dubbele quotes erin. */
function splitsRegel(regel: string, scheider: string): string[] {
  const uit: string[] = [];
  let huidig = "";
  let inQuote = false;
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i];
    if (c === '"') {
      if (inQuote && regel[i + 1] === '"') {
        huidig += '"';
        i++;
      } else inQuote = !inQuote;
    } else if (c === scheider && !inQuote) {
      uit.push(huidig);
      huidig = "";
    } else huidig += c;
  }
  uit.push(huidig);
  return uit.map((v) => v.trim());
}

export type ParseResultaat = { rows: ImportRow[]; onbekendeKolommen: string[]; overgeslagen: number };

export function parseCsv(inhoud: string): ParseResultaat {
  const tekst = inhoud.replace(/^﻿/, "");
  const regels = tekst.split(/\r?\n/).filter((r) => r.trim() !== "");
  if (!regels.length) return { rows: [], onbekendeKolommen: [], overgeslagen: 0 };

  // Scheidingsteken: wat het vaakst in de kopregel staat.
  const kop = regels[0];
  const scheider = (kop.match(/;/g)?.length ?? 0) >= (kop.match(/,/g)?.length ?? 0) ? ";" : ",";
  const koppen = splitsRegel(kop, scheider);
  const velden = koppen.map(veldVan);
  const assen = koppen.filter((k, i) => velden[i] === null && k !== "");

  const rows: ImportRow[] = [];
  let overgeslagen = 0;

  for (const regel of regels.slice(1)) {
    const cellen = splitsRegel(regel, scheider);
    const rij: Partial<ImportRow> & { options: Record<string, string> } = { options: {} };
    for (let i = 0; i < koppen.length; i++) {
      const waarde = cellen[i] ?? "";
      const veld = velden[i];
      if (veld === null) {
        if (koppen[i] && waarde) rij.options[koppen[i]] = waarde;
        continue;
      }
      if (!waarde) continue;
      if (veld === "listPriceEur" || veld === "discountPct" || veld === "purchaseEur") {
        const n = leesBedrag(waarde);
        if (n != null) (rij as Record<string, unknown>)[veld] = n;
      } else {
        (rij as Record<string, unknown>)[veld] = waarde;
      }
    }
    if (!rij.code || !rij.productName) {
      overgeslagen++;
      continue;
    }
    rows.push(rij as ImportRow);
  }

  return { rows, onbekendeKolommen: assen, overgeslagen };
}
