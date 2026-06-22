/**
 * Company details shown on PDFs and in e-mails. Env vars override the defaults
 * below — a Settings screen for this can come later.
 */
// Adres in twee regels: straat, en daaronder postcode + plaats + land.
const addressStreet =
  process.env.COMPANY_ADDRESS_STREET ?? "Camí de la Fontana 3, Locales 2, 3 en 5";
const addressRegion =
  process.env.COMPANY_ADDRESS_REGION ?? "03730 Jávea (Alicante), España";

export const COMPANY = {
  name: process.env.COMPANY_NAME ?? "Habitat One",
  wordmark1: "HABITAT",
  wordmark2: "ONE",
  // Het echte beeldlogo van de website — gebruikt in álle mails en PDF's,
  // zodat de huisstijl overal identiek is. Env override mogelijk.
  logoUrl: process.env.EMAIL_LOGO_URL ?? "https://www.habitat-one.com/logo-habitat.png",
  tagline: process.env.COMPANY_TAGLINE ?? "Xàbia · Costa Blanca",
  // Legal / contact
  legalName: process.env.COMPANY_LEGAL_NAME ?? "Habitat One & One SL",
  vatNumber: process.env.COMPANY_VAT ?? "ESB24855603", // CIF officieel (uit DUA's)
  addressStreet,
  addressRegion,
  address: process.env.COMPANY_ADDRESS ?? `${addressStreet}, ${addressRegion}`,
  email: process.env.COMPANY_EMAIL ?? "hi@habitat-one.com",
  phone: process.env.COMPANY_PHONE ?? "+31 6 51170545",
  website: process.env.COMPANY_WEBSITE ?? "habitat-one.com",
  iban: process.env.COMPANY_IBAN ?? "ES37 0081 0660 0500 0275 8083", // Banco Sabadell
  bic: process.env.COMPANY_BIC ?? "BSABESBBXXX", // Banco Sabadell SWIFT/BIC
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
