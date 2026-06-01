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

type ExampleImage = { data: Buffer; format: "jpg" | "png" };

/** Curated luxe sfeerfoto's (interieur/exterieur, van de website) voor voor-/eindblad. */
const SFEER_IMAGES = [
  "https://habitat-one-ecru.vercel.app/products/magic/huge-travertine-beige-interior.png",
  "https://habitat-one-ecru.vercel.app/products/magic/roman-huge-travertine-white-golden-interior.png",
  "https://habitat-one-ecru.vercel.app/products/magic/ms-travertino-light-grey-interior.png",
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
  itemDesc: { fontSize: 7.5, color: C.muted, marginTop: 1.5, lineHeight: 1.4 },

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
  items: DocumentLineItem[];
  notes: string | null;
  contactName: string | null;
  contactAddress?: string | null;
  /** Taal van het document — volgt de voorkeurstaal van het contact. Default es. */
  locale?: Locale;
  /** Voorbeeldfoto's (Magic Stone) voor het voor- en eindblad. */
  exampleImages?: ExampleImage[];
};

/** Teksten voor het voor- en eindblad, per taal. */
const COVER_TXT: Record<Locale, { for: string; date: string }> = {
  nl: { for: "Voor", date: "Datum" },
  de: { for: "Für", date: "Datum" },
  en: { for: "For", date: "Date" },
  es: { for: "Para", date: "Fecha" },
};
const ENDPAGE_TXT: Record<Locale, { sub: string; thanks: string }> = {
  nl: { sub: "Eindeloze mogelijkheden in kleur en structuur", thanks: "Bedankt voor uw interesse" },
  de: { sub: "Unendliche Möglichkeiten in Farbe und Struktur", thanks: "Vielen Dank für Ihr Interesse" },
  en: { sub: "Endless possibilities in colour and texture", thanks: "Thank you for your interest" },
  es: { sub: "Posibilidades infinitas en color y textura", thanks: "Gracias por su interés" },
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
  coverTagline: { fontSize: 9, color: C.muted, marginTop: 8, letterSpacing: 2 },
  coverHero: { width: "100%", height: 300, objectFit: "cover", borderRadius: 6, marginBottom: 28 },
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
  const images = doc.exampleImages ?? [];
  const hero = images[0];
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
            <Text style={cs.coverBrand1}>{C.wordmark1}</Text>
            <Text style={cs.coverBrand2}>{C.wordmark2}</Text>
            <Text style={cs.coverTagline}>{C.tagline}</Text>
          </View>
          {hero ? <Image src={hero} style={cs.coverHero} /> : null}
          <Text style={cs.coverTitle}>{kindLabels[doc.kind] ?? kindLabels.estimate}</Text>
          {doc.docNumber ? <Text style={cs.coverNumber}>{doc.docNumber}</Text> : null}
          {doc.title ? <Text style={cs.coverSubject}>{doc.title}</Text> : null}
          <View style={cs.coverMetaRow}>
            <View>
              <Text style={cs.coverMetaLabel}>{coverTxt.for.toUpperCase()}</Text>
              <Text style={cs.coverMetaValue}>{doc.contactName ?? "—"}</Text>
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
            <Text style={s.brand1}>{C.wordmark1}</Text>
            <Text style={s.brand2}>{C.wordmark2}</Text>
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
              <Text style={s.partyName}>{doc.contactName ?? "—"}</Text>
              {doc.contactAddress ? (
                <Text style={[s.muted, { textAlign: "right" }]}>{doc.contactAddress}</Text>
              ) : null}
            </View>
          </View>

          {doc.title ? <Text style={s.docSubject}>{doc.title}</Text> : null}

          {/* ---- line items ---- */}
          <View style={s.th}>
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
            items.map((it, i) => (
              <View key={i} style={[s.tr, i % 2 === 1 ? s.trAlt : {}]} wrap={false}>
                <View style={s.cDesc}>
                  <Text style={s.itemName}>{it.name}</Text>
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
            ))
          )}

          {/* ---- payment block + totals ---- */}
          {!isDelivery && (
            <View style={s.bottomRow}>
              <View style={{ flex: 1 }}>
                {isInvoice ? (
                  <View style={s.payBox}>
                    <Text style={s.payTitle}>{t.paymentTitle}</Text>
                    {C.iban ? <Text>IBAN: {C.iban}</Text> : null}
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

      {showExtras && images.length > 1 ? (
        <Page size="A4" style={cs.endPage}>
          <Text style={cs.endHeading}>Flexibel Stone</Text>
          <Text style={cs.endSub}>{endTxt.sub}</Text>
          <View style={cs.grid}>
            {images.slice(1, 5).map((img, i) => (
              <Image key={i} src={img} style={cs.gridImg} />
            ))}
          </View>
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
              <Text style={cs.coverBrand1}>{C.wordmark1}</Text>
              <Text style={cs.coverBrand2}>{C.wordmark2}</Text>
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
