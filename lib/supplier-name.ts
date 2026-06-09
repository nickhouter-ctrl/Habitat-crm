/**
 * Nette weergavenaam voor een leverancier in rapporten/grafieken.
 * Verandert NIETS aan de opgeslagen `purchase_orders.supplier` (die blijft de
 * ruwe bron voor koppeling met facturen/Holded) — puur cosmetisch voor de UI:
 * kapitalen → titelcase, juridische suffixen eraf, en een paar handmatige
 * aliassen voor leveranciers die onder meerdere schrijfwijzen voorkomen.
 */

/** Handmatige aliassen (incl. Allpack — bewust apart: goederen vs. agent). */
const ALIASES: Record<string, string> = {
  "ALLPACK ENTERPRISES LTD": "Allpack Enterprises (goederen)",
  "Allpack (CN agent)": "Allpack · agent China",
};

/** Juridische rechtsvorm-suffixen die we voor de leesbaarheid weglaten. */
const LEGAL = /[\s,]*\b(s\.?l\.?u?|sociedad limitada|ltd|s\.?a|b\.?v|gmbh|inc)\.?\s*$/i;

const ACRONYM = /^[A-Z]{2,4}$/; // korte hoofdletter-tokens (WGK, XPS, SHN) behouden

function titleCaseToken(w: string): string {
  if (ACRONYM.test(w)) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

export function prettySupplierName(raw: string | null | undefined): string {
  const r = (raw ?? "").trim();
  if (!r) return "Onbekend";
  if (ALIASES[r]) return ALIASES[r];

  let s = r.replace(LEGAL, "").replace(/[.,]\s*$/, "").trim();

  // Titelcasen als de naam helemaal in HOOFDLETTERS of helemaal in kleine letters
  // staat. Namen die al netjes mixed-case zijn (bv. "Hebei Zengyi (XPS)",
  // "KKR / KingKonree") laten we ongemoeid zodat acroniemen behouden blijven.
  const letters = s.replace(/[^A-Za-z]/g, "");
  const uppers = s.replace(/[^A-Z]/g, "").length;
  if (letters.length > 0 && (uppers / letters.length > 0.7 || uppers === 0)) {
    s = s.split(/\s+/).map(titleCaseToken).join(" ");
  }
  return s || r;
}
