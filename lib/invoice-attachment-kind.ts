/**
 * Wat voor soort bijlage is dit — puur op de bestandsnaam.
 *
 * Los van `purchase-invoice-intake` omdat die module de database, opslag en mail
 * meesleept: deze twee regels bepalen of er een te-betalen post ontstaat, en dat
 * wil je kunnen testen zonder halve applicatie.
 */

/** Proforma's/offertes zijn nooit een te-betalen post. */
export function isProformaOrQuote(filename: string): boolean {
  return /\bproforma\b|\bquotation\b|\bquote\b|^PI[\s._-]|\bPI\s+for\b/i.test(filename);
}

/**
 * Ziet dit eruit als de SPECIFICATIE bij een factuur (urenverantwoording,
 * pakbon, desglose) in plaats van als de factuur zelf?
 *
 * Wilhelmus mailt elke week twee bijlagen: "factura N° 4" en "JUSTIFICACION
 * HORAS N°4". Dat is één rekening met haar onderbouwing, maar het waren twee
 * kaarten in de wachtrij en dus twee inkoopfacturen — bij N° 4 stond er
 * € 3.252,01 geboekt op een rekening van € 1.780,51.
 *
 * Bewust alléén op de bestandsnaam: het bedrag verschilt juist (de urenstaat
 * staat ex btw), dus daar valt niets aan af te lezen. En bewust alleen gebruikt
 * wanneer in dezelfde mail óók een echte factuur zit — stuurt een leverancier
 * enkel een urenstaat, dan blijft dat gewoon een factuur om te keuren.
 */
export function isSpecificationAttachment(filename: string): boolean {
  return /justificaci|justificante|justification|verantwoording|specificat|especificaci|desglose|\bparte\s+de\s+horas\b|\btimesheet\b|\burenstaat\b|\bpakbon\b|\balbaran\b|\balbarán\b/i.test(
    filename,
  );
}
