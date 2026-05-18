/**
 * Client-veilige categorie-constanten voor bijlagen.
 * Geen server-only imports — mag in client-componenten worden gebruikt.
 */
export const CATEGORIES = {
  "supplier-invoice": "Leverancier",
  "agent-fee-china": "Allpack",
  "agent-fee-spain": "Teresa",
  "freight-invoice": "Vracht",
  "customs-dua": "Douane",
  "opex": "Bedrijfskosten",
  "contractor": "Aannemer",
  "bank-statement": "Bank",
  "quote-proforma": "Offerte",
  "certificate": "Certificaat",
  "other": "Overig",
} as const;

export type AttachmentCategory = keyof typeof CATEGORIES;
