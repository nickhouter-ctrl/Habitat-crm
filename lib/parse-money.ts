/**
 * Eén plek waar een ingetikt bedrag een getal wordt.
 *
 * Stond in tien bestanden gekopieerd als `s.replace(/\./g, "").replace(",", ".")`
 * — alle punten weg, want die zijn duizendtallen. Dat gaat goed bij "1.234,56"
 * en catastrofaal mis bij "3800.000000": daar wordt 3.800.000.000 van. Dat is
 * geen theorie; sinds het uurtarief zes decimalen heeft, staat er precies zo'n
 * waarde in het bewerkveld van een urenregel.
 *
 * De regel hier: kijk naar de LAATSTE scheidingsteken en beslis op vorm, niet op
 * teken. Alleen een punt- of kommagroep van exact drie cijfers die zich herhaalt
 * is een duizendtalscheiding.
 */

/**
 * "1.234,56" → 1234.56 · "28.000000" → 28 · "1,5" → 1.5 · "" → null.
 * Geeft null bij onzin, zodat de aanroeper zelf kan bepalen wat er dan gebeurt.
 */
export function parseMoney(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim().replace(/\s/g, "").replace(/^€/, "");
  if (!s) return null;
  if (!/[\d]/.test(s)) return null;

  const laatstePunt = s.lastIndexOf(".");
  const laatsteKomma = s.lastIndexOf(",");

  let genormaliseerd: string;
  if (laatstePunt >= 0 && laatsteKomma >= 0) {
    // Allebei aanwezig: de laatste is de decimaalscheiding, de andere duizendtallen.
    const decimaal = laatstePunt > laatsteKomma ? "." : ",";
    const duizend = decimaal === "." ? "," : ".";
    genormaliseerd = s.split(duizend).join("").replace(decimaal, ".");
  } else if (laatsteKomma >= 0) {
    // Alleen komma's: duizendtallen als het patroon 1,234 / 1,234,567 is.
    genormaliseerd = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  } else if (laatstePunt >= 0) {
    // Alleen punten: duizendtallen als het patroon 1.234 / 1.234.567 is. Anders
    // is het gewoon een decimaalpunt — ook bij "28.000000".
    genormaliseerd = /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.split(".").join("") : s;
  } else {
    genormaliseerd = s;
  }

  const n = Number(genormaliseerd);
  return Number.isFinite(n) ? n : null;
}

/** Als string voor een numeric-kolom; null bij leeg/onzin. */
export function moneyOrNull(raw: string | null | undefined): string | null {
  const n = parseMoney(raw);
  return n == null ? null : String(n);
}

/** Als string voor een numeric-kolom, met 0 als terugval. */
export function moneyOrZero(raw: string | null | undefined): string {
  return moneyOrNull(raw) ?? "0";
}

/**
 * Bedrag voor een invoerveld: geen sleep van nullen ("28.000000" → "28"), maar
 * wel de decimalen die er echt toe doen ("28.000747" → "28,000747").
 */
export function moneyForInput(raw: string | number | null | undefined): string {
  if (raw == null || raw === "") return "";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return String(Math.round(n * 1e6) / 1e6).replace(".", ",");
}
