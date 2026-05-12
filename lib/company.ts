/**
 * Company details shown on PDFs and in e-mails. Edit these (or override via env
 * vars) — a Settings screen for this can come later.
 */
export const COMPANY = {
  name: process.env.COMPANY_NAME ?? "Habitat One",
  wordmark1: "HABITAT",
  wordmark2: "ONE",
  tagline: process.env.COMPANY_TAGLINE ?? "Xàbia · Costa Blanca",
  // Legal / contact — fill in the real values.
  legalName: process.env.COMPANY_LEGAL_NAME ?? "Habitat One",
  vatNumber: process.env.COMPANY_VAT ?? "", // NIF / CIF
  address: process.env.COMPANY_ADDRESS ?? "Xàbia (Jávea), Alicante, España",
  email: process.env.COMPANY_EMAIL ?? "info@habitat-one.com",
  phone: process.env.COMPANY_PHONE ?? "",
  website: process.env.COMPANY_WEBSITE ?? "habitat-one.com",
  iban: process.env.COMPANY_IBAN ?? "",
  // Brand colour (deep Mediterranean brown — matches the wordmark).
  brown: "#3a2a20",
  cream: "#f3efe9",
  accent: "#1f6f5c",
} as const;
