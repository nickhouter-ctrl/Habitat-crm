import { normalizeDocItems } from "@/lib/documents";

type PairDoc = {
  id: string;
  kind: string;
  status: string;
  docNumber?: string | null;
  /** Bedrag om te vergelijken; subtotaal of totaal, als beide kanten maar hetzelfde gebruiken. */
  amount: number | string | null;
  items?: unknown;
};

const cents = (v: number | string | null) => Math.round(Math.abs(Number(v ?? 0)) * 100);

function itemSignature(items: unknown): string | null {
  const lines = normalizeDocItems(items);
  if (!lines.length) return null;
  return lines
    .map(it => `${String(it.name ?? "").trim().toLowerCase()}|${Number(it.units) || 0}|${Math.round((Number(it.price) || 0) * 100)}`)
    .sort()
    .join("\n");
}

/** "CN-F260012" → "260012", "FAC-2026-0031" → "20260031": alleen de cijfers van het nummer. */
const digits = (n?: string | null) => (n ?? "").replace(/\D/g, "");

/**
 * Facturen die door een creditnota volledig zijn teruggedraaid, plus die
 * creditnota's zelf. Samen tellen ze netto nul; in lijsten en bij "openstaand"
 * zijn ze alleen ruis (en een gecrediteerde factuur is geen openstaande vordering).
 *
 * Een paar = zelfde bedrag tot op de cent én dezelfde regels, of — als regels
 * ontbreken — een creditnotanummer dat het factuurnummer bevat. Gedeeltelijke
 * creditnota's vormen geen paar en blijven gewoon zichtbaar.
 */
export function gecrediteerdeParen(docs: PairDoc[]): Set<string> {
  const telt = (d: PairDoc) => d.status !== "draft" && d.status !== "void";
  const facturen = docs.filter(d => d.kind === "invoice" && telt(d));
  const gekoppeld = new Set<string>();
  for (const cn of docs.filter(d => d.kind === "creditnote" && telt(d))) {
    const bedrag = cents(cn.amount);
    if (!bedrag) continue;
    const regels = itemSignature(cn.items);
    const cnNummer = digits(cn.docNumber);
    const factuur = facturen.find(f => {
      if (gekoppeld.has(f.id) || cents(f.amount) !== bedrag) return false;
      const fRegels = itemSignature(f.items);
      if (regels && fRegels) return regels === fRegels;
      const fNummer = digits(f.docNumber);
      return !!fNummer && cnNummer.includes(fNummer);
    });
    if (!factuur) continue;
    gekoppeld.add(factuur.id);
    gekoppeld.add(cn.id);
  }
  return gekoppeld;
}
