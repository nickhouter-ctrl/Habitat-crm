/**
 * Leverancier afleiden uit de SKU-prefix. Onze SKU's coderen de leverancier in
 * de letter-prefix (MS = Magic Stone, KKR = KingKonree, etc.), zodat een
 * bestelregel automatisch naar de juiste leverancier-bestelbon kan.
 *
 * Pure functie — ook bruikbaar in client-componenten.
 */
export const PREFIX_SUPPLIER: Record<string, string> = {
  MS: "Magic Stone",
  KKR: "KKR / KingKonree",
  GL: "George Lighting",
  WB: "Hebei Zengyi (XPS)",
  SS: "Foshan MY Metal",
  // Bloempotten (Ethick / Prosperplast)
  TEP: "Prosperplast",
  TBO: "Prosperplast",
  TMBO: "Prosperplast",
  TMOS: "Prosperplast",
  TDE: "Prosperplast",
  TDEO: "Prosperplast",
  TCR: "Prosperplast",
  TUO: "Prosperplast",
  TU: "Prosperplast",
  TCA: "Prosperplast",
  TCS: "Prosperplast",
  TCB: "Prosperplast",
  TCC: "Prosperplast",
  TR: "Prosperplast",
  TT: "Prosperplast",
  TGAO: "Prosperplast",
  TBL: "Prosperplast",
  FCAK: "Prosperplast",
  // DR (deuren) bewust niet gemapt — leverancier handmatig kiezen.
};

/** Geef de leverancier voor een SKU, of "" als de prefix onbekend is. */
export function supplierForSku(sku: string | null | undefined): string {
  if (!sku) return "";
  const m = sku.match(/^([A-Za-z]+)/);
  if (!m) return "";
  const prefix = m[1].toUpperCase();
  // Langste match eerst (bv. TMBO vóór T zou T niet bestaan, maar voor de
  // zekerheid exact op de volledige letter-prefix).
  return PREFIX_SUPPLIER[prefix] ?? "";
}
