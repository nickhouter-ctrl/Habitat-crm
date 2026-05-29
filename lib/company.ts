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
  vatNumber: process.env.COMPANY_VAT ?? "ESB24855603", // CIF officieel (uit DUA's)
  address:
    process.env.COMPANY_ADDRESS ??
    "Camí de la Fontana 3, Locales 2, 3 en 5, 03730 Jávea (Alicante), España",
  email: process.env.COMPANY_EMAIL ?? "hi@habitat-one.com",
  phone: process.env.COMPANY_PHONE ?? "+34 965 00 11 22",
  website: process.env.COMPANY_WEBSITE ?? "habitat-one.com",
  iban: process.env.COMPANY_IBAN ?? "", // not provided yet
  // Luxe-mediterraanse palet — gebruikt op PDFs en e-mails.
  brown: "#3a2a20",        // wordmark / hoofdtitels
  cream: "#f3efe9",        // achtergrond
  sand: "#e8dfd0",          // alternating row bg, scheidingslijn
  terracotta: "#b6552d",    // accent, secundaire titel
  gold: "#a98a4b",          // dunne highlight-lijntjes
  sage: "#7d8763",          // tertiaire accent (rust, evenwicht)
  charcoal: "#2a2520",      // body-tekst
  muted: "#7a6f63",         // labels, captions
  /** Legacy alias — sommige oudere PDF-onderdelen gebruiken dit nog. */
  accent: "#b6552d",
} as const;
