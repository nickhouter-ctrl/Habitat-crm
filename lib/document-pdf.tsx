/* Server-only: renders a CRM document (offerte / factuur) to a PDF via @react-pdf/renderer. */
import path from "node:path";

import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { COMPANY } from "@/lib/company";
import type { DocumentLineItem } from "@/lib/db/schema";
import { lineNet } from "@/lib/documents";
import type { Locale } from "@/lib/translate";

// Habitat One huisstijl-lettertype (Sora) — zelfde als website + prijslijst-PDF.
const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
Font.register({
  family: "Sora",
  fonts: [
    { src: path.join(FONT_DIR, "Sora-Light.ttf"), fontWeight: 300 },
    { src: path.join(FONT_DIR, "Sora-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Sora-Medium.ttf"), fontWeight: 500 },
    { src: path.join(FONT_DIR, "Sora-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "Sora-Bold.ttf"), fontWeight: 700 },
    { src: path.join(FONT_DIR, "Sora-ExtraBold.ttf"), fontWeight: 800 },
  ],
});

// Cormorant Garamond — sierlijke serif voor de merknaam/wordmark (zoals het website-logo).
const CORMORANT_DIR = path.join(process.cwd(), "public", "fonts", "cormorant");
Font.register({
  family: "Cormorant",
  fonts: [
    { src: path.join(CORMORANT_DIR, "CormorantGaramond-Medium.ttf"), fontWeight: 500 },
    { src: path.join(CORMORANT_DIR, "CormorantGaramond-SemiBold.ttf"), fontWeight: 600 },
  ],
});

// Eigen logo (HABITAT ONE) voor de PDF-header.
const LOGO_PATH = path.join(process.cwd(), "public", "brand", "habitat-one-logo.png");
// Crème-variant (donkere letters) — voor het voor- en eindblad met crème/lichte
// achtergrond, zodat het logo elegant meebeweegt i.p.v. een hard zwart blok.
const LOGO_PATH_CREAM = path.join(process.cwd(), "public", "brand", "habitat-one-logo-cream.png");

type ExampleImage = { data: Buffer; format: "jpg" | "png" };

/**
 * Curated luxe sfeerfoto's voor het voor- en eindblad. Vaste, eigen /pdf/-set op
 * de website (los van de product-beeldbibliotheek, zodat hernoemingen daar deze
 * nooit meer breken). Volgorde telt: [exterieur, exterieur] → voorblad,
 * [interieur, interieur] → eindblad.
 */
const SFEER_IMAGES = [
  "https://habitat-one-ecru.vercel.app/pdf/ext-1.jpg",
  "https://habitat-one-ecru.vercel.app/pdf/ext-2.jpg",
  "https://habitat-one-ecru.vercel.app/pdf/int-1.jpg",
  "https://habitat-one-ecru.vercel.app/pdf/int-2.jpg",
];

/* ---------------------------------------------------------------- i18n */

const INTL_LOCALE: Record<Locale, string> = {
  nl: "nl-NL",
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
};

const eurFor = (locale: Locale) => (v: string | number | null | undefined) =>
  new Intl.NumberFormat(INTL_LOCALE[locale], { style: "currency", currency: "EUR" }).format(
    Number(v) || 0,
  );

const fdateFor = (locale: Locale) => (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat(INTL_LOCALE[locale], {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
};

const KIND_LABEL: Record<Locale, Record<string, string>> = {
  nl: {
    estimate: "OFFERTE",
    proforma: "PRO-FORMA",
    invoice: "FACTUUR",
    creditnote: "CREDITNOTA",
    salesreceipt: "BON",
    deliverynote: "PAKBON",
  },
  de: {
    estimate: "ANGEBOT",
    proforma: "PRO-FORMA",
    invoice: "RECHNUNG",
    creditnote: "GUTSCHRIFT",
    salesreceipt: "BELEG",
    deliverynote: "LIEFERSCHEIN",
  },
  en: {
    estimate: "QUOTATION",
    proforma: "PRO FORMA",
    invoice: "INVOICE",
    creditnote: "CREDIT NOTE",
    salesreceipt: "RECEIPT",
    deliverynote: "DELIVERY NOTE",
  },
  es: {
    estimate: "PRESUPUESTO",
    proforma: "PRO FORMA",
    invoice: "FACTURA",
    creditnote: "ABONO",
    salesreceipt: "RECIBO",
    deliverynote: "ALBARÁN",
  },
};

type Dict = {
  date: string;
  dueInvoice: string;
  validUntil: string;
  from: string;
  to: string;
  project: string;
  description: string;
  category: string;
  qty: string;
  price: string;
  vat: string;
  net: string;
  discount: string;
  noLines: string;
  subtotal: string;
  vatTotal: string;
  total: string;
  deliveredBy: string;
  receivedBy: string;
  paymentTitle: string;
  payNote: string;
  page: string;
};

const DICT: Record<Locale, Dict> = {
  nl: {
    date: "Datum",
    dueInvoice: "Vervaldatum",
    validUntil: "Geldig t/m",
    from: "VAN",
    to: "VOOR",
    project: "Project",
    description: "OMSCHRIJVING",
    category: "CATEGORIE",
    qty: "AANTAL",
    price: "PRIJS",
    vat: "BTW",
    net: "NETTO",
    discount: "Korting",
    noLines: "Geen regels.",
    subtotal: "Subtotaal",
    vatTotal: "BTW (IVA)",
    total: "Totaal",
    deliveredBy: "Geleverd door (handtekening)",
    receivedBy: "Ontvangen door (handtekening)",
    paymentTitle: "Betaalgegevens",
    payNote: "Gelieve te betalen vóór de vervaldatum o.v.v. het factuurnummer.",
    page: "Pagina",
  },
  de: {
    date: "Datum",
    dueInvoice: "Fällig am",
    validUntil: "Gültig bis",
    from: "VON",
    to: "FÜR",
    project: "Projekt",
    description: "BESCHREIBUNG",
    category: "KATEGORIE",
    qty: "MENGE",
    price: "PREIS",
    vat: "MwSt",
    net: "NETTO",
    discount: "Rabatt",
    noLines: "Keine Positionen.",
    subtotal: "Zwischensumme",
    vatTotal: "MwSt (IVA)",
    total: "Gesamt",
    deliveredBy: "Geliefert von (Unterschrift)",
    receivedBy: "Empfangen von (Unterschrift)",
    paymentTitle: "Zahlungsinformationen",
    payNote: "Bitte bis zum Fälligkeitsdatum unter Angabe der Rechnungsnummer bezahlen.",
    page: "Seite",
  },
  en: {
    date: "Date",
    dueInvoice: "Due date",
    validUntil: "Valid until",
    from: "FROM",
    to: "TO",
    project: "Project",
    description: "DESCRIPTION",
    category: "CATEGORY",
    qty: "QTY",
    price: "PRICE",
    vat: "VAT",
    net: "NET",
    discount: "Discount",
    noLines: "No items.",
    subtotal: "Subtotal",
    vatTotal: "VAT (IVA)",
    total: "Total",
    deliveredBy: "Delivered by (signature)",
    receivedBy: "Received by (signature)",
    paymentTitle: "Payment details",
    payNote: "Please pay by the due date, quoting the invoice number.",
    page: "Page",
  },
  es: {
    date: "Fecha",
    dueInvoice: "Vencimiento",
    validUntil: "Válido hasta",
    from: "DE",
    to: "PARA",
    project: "Proyecto",
    description: "DESCRIPCIÓN",
    category: "CATEGORÍA",
    qty: "CANT.",
    price: "PRECIO",
    vat: "IVA",
    net: "NETO",
    discount: "Descuento",
    noLines: "Sin líneas.",
    subtotal: "Subtotal",
    vatTotal: "IVA",
    total: "Total",
    deliveredBy: "Entregado por (firma)",
    receivedBy: "Recibido por (firma)",
    paymentTitle: "Datos de pago",
    payNote: "Rogamos efectuar el pago antes del vencimiento indicando el número de factura.",
    page: "Página",
  },
};

const CATEGORY_LABEL: Record<string, Record<Locale, string>> = {
  materiaal: {
    nl: "Materiaal / levering",
    de: "Material / Lieferung",
    en: "Materials / supply",
    es: "Material / suministro",
  },
  renovatie: {
    nl: "Renovatie / verbouwing",
    de: "Renovierung / Umbau",
    en: "Renovation",
    es: "Reforma",
  },
  arbeid: {
    nl: "Arbeid / uitvoering",
    de: "Arbeit / Ausführung",
    en: "Labour",
    es: "Mano de obra",
  },
  plaatsing: {
    nl: "Plaatsing / montage",
    de: "Montage",
    en: "Installation",
    es: "Instalación / montaje",
  },
  ontwerp: {
    nl: "Ontwerp / advies",
    de: "Design / Beratung",
    en: "Design / advice",
    es: "Diseño / asesoría",
  },
  transport: {
    nl: "Transport / logistiek",
    de: "Transport / Logistik",
    en: "Transport / logistics",
    es: "Transporte / logística",
  },
  overig: { nl: "Overig", de: "Sonstiges", en: "Other", es: "Otros" },
};

const catLabel = (category: string | null | undefined, locale: Locale): string => {
  if (!category) return "—";
  return CATEGORY_LABEL[category]?.[locale] ?? category;
};

/* --------------------------------------------------------------- styles */

const C = COMPANY;

const s = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 72,
    paddingHorizontal: 0,
    fontSize: 9,
    fontFamily: "Sora",
    color: C.charcoal,
  },
  /* header band */
  headerBand: {
    backgroundColor: C.cream,
    paddingHorizontal: 44,
    paddingTop: 34,
    paddingBottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  logo: { width: 118, height: 70, objectFit: "contain", marginBottom: 2 },
  brand1: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 26, letterSpacing: 5, color: C.brown },
  brand2: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 26, letterSpacing: 5, color: C.brown, marginTop: -3 },
  tagline: { fontSize: 8, color: C.muted, marginTop: 5, letterSpacing: 1 },
  headerRight: { alignItems: "flex-end" },
  docTitle: { fontFamily: "Sora", fontWeight: 700, fontSize: 19, letterSpacing: 1.5, color: C.terracotta },
  docNumber: { fontSize: 9, color: C.brown, fontFamily: "Sora", fontWeight: 700, marginTop: 3 },
  meta: { fontSize: 8.5, color: C.muted, textAlign: "right", marginTop: 4 },
  metaStrong: { color: C.charcoal, fontFamily: "Sora", fontWeight: 700 },
  accentRule: { height: 3, backgroundColor: C.terracotta },
  goldRule: { height: 1, backgroundColor: C.gold },

  body: { paddingHorizontal: 44, paddingTop: 24 },

  parties: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20, gap: 28 },
  partyLabel: { fontSize: 7, color: C.muted, letterSpacing: 1.5, marginBottom: 4 },
  partyName: { fontFamily: "Sora", fontWeight: 700, color: C.brown, fontSize: 10 },
  muted: { color: C.muted },

  docSubject: {
    marginBottom: 12,
    fontSize: 11,
    fontFamily: "Sora", fontWeight: 700,
    color: C.brown,
  },

  th: {
    flexDirection: "row",
    backgroundColor: C.cream,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1.5,
    borderColor: C.brown,
  },
  thText: { fontFamily: "Sora", fontWeight: 700, fontSize: 7, letterSpacing: 0.6, color: C.brown },
  tr: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderColor: "#e5e3de",
  },
  trAlt: { backgroundColor: "#faf8f4" },
  cDesc: { flex: 4, paddingRight: 6 },
  cCat: { flex: 1.6, color: C.muted, paddingRight: 4 },
  cNum: { flex: 1, textAlign: "right" },
  cVat: { flex: 0.8, textAlign: "right" },
  cAmt: { flex: 1.3, textAlign: "right" },
  itemName: { fontFamily: "Sora", fontWeight: 700, color: C.charcoal },
  itemSku: { fontFamily: "Sora", fontWeight: 500, fontSize: 7, color: C.brown, marginTop: 1 },
  itemDesc: { fontSize: 7.5, color: C.muted, marginTop: 1.5, lineHeight: 1.4 },
  cPic: { width: 34, paddingRight: 6 },
  lineImg: { width: 28, height: 28, objectFit: "cover", borderRadius: 2 },
  lineImgEmpty: { width: 28, height: 28, borderRadius: 2, backgroundColor: "#f0eee9" },

  bottomRow: { marginTop: 18, flexDirection: "row", justifyContent: "space-between", gap: 24 },
  payBox: {
    flex: 1,
    backgroundColor: C.cream,
    borderRadius: 4,
    padding: 12,
    alignSelf: "flex-start",
  },
  payTitle: { fontSize: 7, letterSpacing: 1.5, color: C.muted, marginBottom: 4 },
  payNote: { fontSize: 7.5, color: C.muted, marginTop: 6, lineHeight: 1.5 },

  totals: { width: 208 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.brown,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  totalGrandText: { color: "#fff", fontFamily: "Sora", fontWeight: 700, fontSize: 12 },

  signatures: { marginTop: 34, flexDirection: "row", gap: 44 },
  signature: { flex: 1, borderTopWidth: 0.75, borderColor: C.muted, paddingTop: 5 },

  notes: {
    marginTop: 22,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: "#e5e3de",
    fontSize: 8.5,
    color: C.charcoal,
    lineHeight: 1.6,
  },

  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 30,
    borderTopWidth: 1,
    borderColor: C.gold,
    paddingTop: 8,
    fontSize: 7,
    color: C.muted,
    textAlign: "center",
    lineHeight: 1.7,
  },
  pageNo: {
    position: "absolute",
    right: 44,
    bottom: 18,
    fontSize: 7,
    color: C.muted,
    textAlign: "right",
  },
});

export type PdfDoc = {
  kind: string;
  docNumber: string | null;
  title: string | null;
  issueDate: string | Date | null;
  dueDate: string | Date | null;
  subtotalEur: string;
  taxEur: string;
  totalEur: string;
  items: Array<DocumentLineItem & { sku?: string | null }>;
  notes: string | null;
  contactName: string | null;
  /** Eénregelig adres (oude stijl) — fallback als de twee aparte regels ontbreken. */
  contactAddress?: string | null;
  /** Straat (regel 1 van het klantadres). */
  contactAddressLine?: string | null;
  /** Postcode + plaats (regel 2 van het klantadres), net als ons eigen adres. */
  contactAddressRegion?: string | null;
  /** Bedrijfsnaam (zakelijke klant) — komt boven de contactpersoon op de factuur. */
  companyName?: string | null;
  /** CIF/NIF (of BTW-nummer) van de klant — in Spanje verplicht op de factuur. */
  contactVat?: string | null;
  /** Projectnaam — getoond op alle documenten zodat duidelijk is waar het voor is. */
  projectName?: string | null;
  /** Taal van het document — volgt de voorkeurstaal van het contact. Default es. */
  locale?: Locale;
  /** Voorbeeldfoto's (Magic Stone) voor het voor- en eindblad. */
  exampleImages?: ExampleImage[];
  /** Productfoto's per productId — getoond op de pakbon. */
  lineImages?: Record<string, ExampleImage>;
};

/** Teksten voor het voor- en eindblad, per taal. */
const COVER_TXT: Record<Locale, { for: string; date: string; intro: string }> = {
  nl: { for: "Voor", date: "Datum", intro: "Echte natuursteen die meebuigt met uw ontwerp — warm, tijdloos en gemaakt voor de kust." },
  de: { for: "Für", date: "Datum", intro: "Echter Naturstein, der sich Ihrem Entwurf anpasst — warm, zeitlos und für die Küste gemacht." },
  en: { for: "For", date: "Date", intro: "Real natural stone that bends to your design — warm, timeless and made for the coast." },
  es: { for: "Para", date: "Fecha", intro: "Piedra natural real que se adapta a su diseño — cálida, atemporal y hecha para la costa." },
};
const ENDPAGE_TXT: Record<Locale, { sub: string; thanks: string; body: string }> = {
  nl: { sub: "Eindeloze mogelijkheden in kleur en structuur", thanks: "Bedankt voor uw interesse", body: "Elke kleur en structuur is met zorg gekozen. We helpen u graag de juiste afwerking voor uw project te vinden." },
  de: { sub: "Unendliche Möglichkeiten in Farbe und Struktur", thanks: "Vielen Dank für Ihr Interesse", body: "Jede Farbe und Struktur ist mit Sorgfalt gewählt. Gerne helfen wir Ihnen, die richtige Oberfläche für Ihr Projekt zu finden." },
  en: { sub: "Endless possibilities in colour and texture", thanks: "Thank you for your interest", body: "Every colour and texture is chosen with care. We would love to help you find the right finish for your project." },
  es: { sub: "Posibilidades infinitas en color y textura", thanks: "Gracias por su interés", body: "Cada color y textura se elige con cuidado. Estaremos encantados de ayudarle a encontrar el acabado perfecto para su proyecto." },
};

const cs = StyleSheet.create({
  cover: {
    backgroundColor: C.cream,
    paddingTop: 64,
    paddingHorizontal: 54,
    paddingBottom: 50,
    fontFamily: "Sora",
    color: C.charcoal,
  },
  coverWordmark: { alignItems: "center", marginBottom: 26 },
  coverBrand1: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 34, letterSpacing: 8, color: C.brown },
  coverBrand2: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 34, letterSpacing: 8, color: C.brown, marginTop: -4 },
  coverLogo: { width: 210, height: 94, objectFit: "contain", marginBottom: 6 },
  coverLogoSmall: { width: 150, height: 67, objectFit: "contain" },
  coverTagline: { fontSize: 9, color: C.muted, marginTop: 8, letterSpacing: 2 },
  coverHero: { width: "100%", height: 300, objectFit: "cover", borderRadius: 6, marginBottom: 28 },
  coverHeroPair: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  coverHeroHalf: { width: "48.5%", height: 215, objectFit: "cover", borderRadius: 6 },
  coverIntro: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 14, color: C.brown, marginTop: 14, lineHeight: 1.45 },
  coverTitle: { fontFamily: "Sora", fontWeight: 700, fontSize: 34, letterSpacing: 2, color: C.terracotta },
  coverNumber: { fontFamily: "Sora", fontWeight: 700, fontSize: 13, color: C.brown, marginTop: 6 },
  coverSubject: { fontSize: 12, color: C.charcoal, marginTop: 10, lineHeight: 1.4 },
  coverMetaRow: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderColor: C.sand,
    paddingTop: 14,
  },
  coverMetaLabel: { fontSize: 7, letterSpacing: 1.5, color: C.muted },
  coverMetaValue: { fontSize: 11, fontFamily: "Sora", fontWeight: 700, color: C.brown, marginTop: 3 },
  endPage: {
    backgroundColor: "#ffffff",
    paddingTop: 56,
    paddingHorizontal: 54,
    paddingBottom: 50,
    fontFamily: "Sora",
    color: C.charcoal,
  },
  endHeading: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 28, letterSpacing: 3, color: C.brown, textAlign: "center" },
  endSub: { fontSize: 10, color: C.muted, textAlign: "center", marginTop: 7, marginBottom: 24 },
  endBody: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 13, color: C.brown, textAlign: "center", lineHeight: 1.45, marginTop: 18, paddingHorizontal: 36 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  gridImg: { width: "48.5%", height: 210, objectFit: "cover", borderRadius: 5, marginBottom: 14 },
  endFooter: { marginTop: 22, borderTopWidth: 1, borderColor: C.sand, paddingTop: 18, alignItems: "center" },
  endThanks: { fontSize: 12, color: C.brown, fontFamily: "Sora", fontWeight: 700, marginBottom: 10, textAlign: "center" },
  endContact: { fontSize: 8.5, color: C.muted, textAlign: "center", lineHeight: 1.7 },
});

function DocumentPdf({ doc }: { doc: PdfDoc }) {
  const locale: Locale = doc.locale ?? "es";
  const t = DICT[locale];
  const eur = eurFor(locale);
  const fdate = fdateFor(locale);
  const kindLabels = KIND_LABEL[locale];

  const items = doc.items ?? [];
  const isDelivery = doc.kind === "deliverynote";
  const isInvoice = doc.kind === "invoice";

  // Voor-/eindblad met Magic Stone-sfeerimpressie (niet op pakbonnen).
  // [ext, ext] op het voorblad, [int, int] op het eindblad.
  const images = doc.exampleImages ?? [];
  const coverImgs = images.slice(0, 2);
  const endImgs = images.slice(2, 4);
  // Voor-/eindblad met sfeerfoto's terug aan voor offertes/facturen (en andere
  // verkoopdocumenten); pakbonnen blijven clean (starten direct met de header).
  const showExtras = !isDelivery;
  const coverTxt = COVER_TXT[locale];
  const endTxt = ENDPAGE_TXT[locale];

  const footerLine =
    `${C.legalName}${C.vatNumber ? ` · NIF ${C.vatNumber}` : ""} · ${C.address}\n` +
    `${C.email}${C.phone ? ` · ${C.phone}` : ""} · ${C.website}${C.iban ? ` · IBAN ${C.iban}` : ""}`;

  return (
    <Document>
      {showExtras && (
        <Page size="A4" style={cs.cover}>
          <View style={cs.coverWordmark}>
            <Image src={LOGO_PATH_CREAM} style={cs.coverLogo} />
            <Text style={cs.coverTagline}>{C.tagline}</Text>
          </View>
          {coverImgs.length > 0 ? (
            <View style={cs.coverHeroPair}>
              {coverImgs.map((img, i) => (
                <Image key={i} src={img} style={cs.coverHeroHalf} />
              ))}
            </View>
          ) : null}
          <Text style={cs.coverTitle}>{kindLabels[doc.kind] ?? kindLabels.estimate}</Text>
          {doc.docNumber ? <Text style={cs.coverNumber}>{doc.docNumber}</Text> : null}
          {doc.title ? <Text style={cs.coverSubject}>{doc.title}</Text> : null}
          <Text style={cs.coverIntro}>{coverTxt.intro}</Text>
          <View style={cs.coverMetaRow}>
            <View>
              <Text style={cs.coverMetaLabel}>{coverTxt.for.toUpperCase()}</Text>
              <Text style={cs.coverMetaValue}>{doc.companyName ?? doc.contactName ?? "—"}</Text>
            </View>
            <View>
              <Text style={[cs.coverMetaLabel, { textAlign: "right" }]}>{coverTxt.date.toUpperCase()}</Text>
              <Text style={[cs.coverMetaValue, { textAlign: "right" }]}>{fdate(doc.issueDate)}</Text>
            </View>
          </View>
        </Page>
      )}
      <Page size="A4" style={s.page}>
        {/* ---- header band ---- */}
        <View style={s.headerBand} fixed>
          <View>
            <Image src={LOGO_PATH} style={s.logo} />
            <Text style={s.tagline}>{C.tagline}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>{kindLabels[doc.kind] ?? "DOCUMENT"}</Text>
            {doc.docNumber ? <Text style={s.docNumber}>{doc.docNumber}</Text> : null}
            <Text style={s.meta}>
              {t.date}: <Text style={s.metaStrong}>{fdate(doc.issueDate)}</Text>
            </Text>
            {doc.dueDate && !isDelivery ? (
              <Text style={s.meta}>
                {isInvoice ? t.dueInvoice : t.validUntil}:{" "}
                <Text style={s.metaStrong}>{fdate(doc.dueDate)}</Text>
              </Text>
            ) : null}
          </View>
        </View>
        <View style={s.accentRule} fixed />

        {/* ---- body ---- */}
        <View style={s.body}>
          <View style={s.parties}>
            <View style={{ flex: 1 }}>
              <Text style={s.partyLabel}>{t.from}</Text>
              <Text style={s.partyName}>{C.legalName}</Text>
              <Text style={s.muted}>{C.addressStreet}</Text>
              <Text style={s.muted}>{C.addressRegion}</Text>
              {C.vatNumber ? <Text style={s.muted}>NIF: {C.vatNumber}</Text> : null}
              <Text style={s.muted}>{C.email}</Text>
              {C.phone ? <Text style={s.muted}>{C.phone}</Text> : null}
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={s.partyLabel}>{t.to}</Text>
              <Text style={s.partyName}>{doc.companyName ?? doc.contactName ?? "—"}</Text>
              {doc.companyName && doc.contactName && doc.contactName !== doc.companyName ? (
                <Text style={[s.muted, { textAlign: "right" }]}>t.a.v. {doc.contactName}</Text>
              ) : null}
              {doc.contactAddressLine || doc.contactAddressRegion ? (
                <>
                  {doc.contactAddressLine ? (
                    <Text style={[s.muted, { textAlign: "right" }]}>{doc.contactAddressLine}</Text>
                  ) : null}
                  {doc.contactAddressRegion ? (
                    <Text style={[s.muted, { textAlign: "right" }]}>{doc.contactAddressRegion}</Text>
                  ) : null}
                </>
              ) : doc.contactAddress ? (
                <Text style={[s.muted, { textAlign: "right" }]}>{doc.contactAddress}</Text>
              ) : null}
              {doc.contactVat ? (
                <Text style={[s.muted, { textAlign: "right" }]}>CIF/NIF: {doc.contactVat}</Text>
              ) : null}
              {doc.projectName ? (
                <Text style={[s.partyName, { textAlign: "right", marginTop: 6, color: C.terracotta }]}>
                  {t.project}: {doc.projectName}
                </Text>
              ) : null}
            </View>
          </View>

          {doc.title ? <Text style={s.docSubject}>{doc.title}</Text> : null}

          {/* ---- line items ---- */}
          <View style={s.th}>
            {isDelivery && <Text style={[s.thText, s.cPic]} />}
            <Text style={[s.thText, s.cDesc]}>{t.description}</Text>
            <Text style={[s.thText, s.cCat]}>{t.category}</Text>
            <Text style={[s.thText, isDelivery ? s.cAmt : s.cNum]}>{t.qty}</Text>
            {!isDelivery && (
              <>
                <Text style={[s.thText, s.cNum]}>{t.price}</Text>
                <Text style={[s.thText, s.cVat]}>{t.vat}</Text>
                <Text style={[s.thText, s.cAmt]}>{t.net}</Text>
              </>
            )}
          </View>
          {items.length === 0 ? (
            <Text style={[s.tr, s.muted]}>{t.noLines}</Text>
          ) : (
            items.map((it, i) => {
              const img = it.productId ? doc.lineImages?.[it.productId] : undefined;
              return (
                <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
                  {isDelivery && (
                    <View style={s.cPic}>
                      {img ? (
                        <Image src={img} style={s.lineImg} />
                      ) : (
                        <View style={s.lineImgEmpty} />
                      )}
                    </View>
                  )}
                  <View style={s.cDesc}>
                    <Text style={s.itemName}>{it.name}</Text>
                    {it.sku ? <Text style={s.itemSku}>{it.sku}</Text> : null}
                    {it.description ? <Text style={s.itemDesc}>{it.description}</Text> : null}
                    {!isDelivery && it.discount ? (
                      <Text style={s.itemDesc}>
                        {t.discount} {it.discount}%
                      </Text>
                    ) : null}
                  </View>
                  <Text style={s.cCat}>{catLabel(it.category, locale)}</Text>
                  <Text style={isDelivery ? s.cAmt : s.cNum}>{it.units}</Text>
                  {!isDelivery && (
                    <>
                      <Text style={s.cNum}>{eur(it.price)}</Text>
                      <Text style={s.cVat}>{it.taxRate ?? 0}%</Text>
                      <Text style={s.cAmt}>{eur(lineNet(it))}</Text>
                    </>
                  )}
                </View>
              );
            })
          )}

          {/* ---- payment block + totals ---- */}
          {!isDelivery && (
            <View style={s.bottomRow}>
              <View style={{ flex: 1 }}>
                {isInvoice ? (
                  <View style={s.payBox}>
                    <Text style={s.payTitle}>{t.paymentTitle}</Text>
                    {C.iban ? <Text>IBAN: {C.iban}</Text> : null}
                    {C.bic ? <Text>BIC: {C.bic}</Text> : null}
                    <Text style={s.muted}>{C.legalName}</Text>
                    <Text style={s.payNote}>{t.payNote}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.totals}>
                <View style={s.totalRow}>
                  <Text style={s.muted}>{t.subtotal}</Text>
                  <Text>{eur(doc.subtotalEur)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={s.muted}>{t.vatTotal}</Text>
                  <Text>{eur(doc.taxEur)}</Text>
                </View>
                <View style={s.totalGrand}>
                  <Text style={s.totalGrandText}>{t.total}</Text>
                  <Text style={s.totalGrandText}>{eur(doc.totalEur)}</Text>
                </View>
              </View>
            </View>
          )}

          {/* ---- delivery-note signatures ---- */}
          {isDelivery && (
            <View style={s.signatures}>
              <View style={s.signature}>
                <Text style={s.muted}>{t.deliveredBy}</Text>
              </View>
              <View style={s.signature}>
                <Text style={s.muted}>{t.receivedBy}</Text>
              </View>
            </View>
          )}

          {doc.notes ? <Text style={s.notes}>{doc.notes}</Text> : null}
        </View>

        {/* ---- footer ---- */}
        <Text style={s.footer} fixed>
          {footerLine}
        </Text>
        <Text
          style={s.pageNo}
          fixed
          render={({ pageNumber, totalPages }) =>
            totalPages > 1 ? `${t.page} ${pageNumber} / ${totalPages}` : ""
          }
        />
      </Page>

      {showExtras && endImgs.length > 0 ? (
        <Page size="A4" style={cs.endPage}>
          <Text style={cs.endHeading}>Flexibel Stone</Text>
          <Text style={cs.endSub}>{endTxt.sub}</Text>
          <View style={cs.grid}>
            {endImgs.map((img, i) => (
              <Image key={i} src={img} style={cs.gridImg} />
            ))}
          </View>
          <Text style={cs.endBody}>{endTxt.body}</Text>
          <View style={cs.endFooter}>
            <Text style={cs.endThanks}>{endTxt.thanks}</Text>
            <Text style={cs.endContact}>
              {C.legalName}
              {"\n"}
              {C.address}
              {"\n"}
              {C.phone} · {C.email} · {C.website}
            </Text>
            <View style={{ marginTop: 14, alignItems: "center" }}>
              <Image src={LOGO_PATH_CREAM} style={cs.coverLogoSmall} />
            </View>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

/** Pre-fetcht de curated sfeerfoto's (een onbereikbare foto laat de PDF nooit falen). */
async function fetchSfeerImages(): Promise<ExampleImage[]> {
  const out: ExampleImage[] = [];
  for (const u of SFEER_IMAGES) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (!r.ok) continue;
      out.push({
        data: Buffer.from(await r.arrayBuffer()),
        format: u.toLowerCase().endsWith(".png") ? "png" : "jpg",
      });
    } catch {
      /* sla over */
    }
  }
  return out;
}

export async function renderDocumentPdf(doc: PdfDoc): Promise<Buffer> {
  const exampleImages = doc.exampleImages ?? (await fetchSfeerImages());
  return renderToBuffer(<DocumentPdf doc={{ ...doc, exampleImages }} />);
}
