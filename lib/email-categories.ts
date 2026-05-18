/**
 * Client-veilige categorie-constanten voor bijlagen.
 * Geen server-only imports — mag in client-componenten worden gebruikt.
 */
export const CATEGORIES = {
  "supplier-invoice": "Factuur leverancier (Yohome/KKR/MS)",
  "agent-fee-china": "Allpack handling (China)",
  "agent-fee-spain": "Teresa commissie (Spanje)",
  "freight-invoice": "Vrachtfactuur (Alianza)",
  "customs-dua": "DUA / Douane",
  "bank-statement": "Bankafschrift",
  "quote-proforma": "Offerte / Proforma",
  "certificate": "Certificaat (CE/CITES)",
  "other": "Overig",
} as const;

export type AttachmentCategory = keyof typeof CATEGORIES;
