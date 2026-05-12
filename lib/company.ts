/**
 * Company details shown on PDFs and in e-mails. Env vars override the defaults
 * below — a Settings screen for this can come later.
 */
export const COMPANY = {
  name: process.env.COMPANY_NAME ?? "Habitat One",
  wordmark1: "HABITAT",
  wordmark2: "ONE",
  tagline: process.env.COMPANY_TAGLINE ?? "Xàbia · Costa Blanca",
  // Legal / contact
  legalName: process.env.COMPANY_LEGAL_NAME ?? "Habitat One & One SL",
  vatNumber: process.env.COMPANY_VAT ?? "B24855603", // CIF/NIF/VAT
  address:
    process.env.COMPANY_ADDRESS ?? "C/ Charles Ives 15, 03738 Xàbia/Jávea, Alicante, España",
  email: process.env.COMPANY_EMAIL ?? "hi@habitat-one.com",
  phone: process.env.COMPANY_PHONE ?? "+34 637 459 239",
  website: process.env.COMPANY_WEBSITE ?? "habitat-one.com",
  iban: process.env.COMPANY_IBAN ?? "", // not provided yet
  // Brand colour (deep Mediterranean brown — matches the wordmark).
  brown: "#3a2a20",
  cream: "#f3efe9",
  accent: "#1f6f5c",
} as const;
