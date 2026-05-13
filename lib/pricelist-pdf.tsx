/* Server-only: rendert een luxe-Mediterrane prijslijst als PDF. */
import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { COMPANY } from "@/lib/company";
import { formatDimensions } from "@/lib/products";

export type PricelistLocale = "nl" | "de" | "en" | "es";

const LABELS: Record<PricelistLocale, {
  title: string;
  intro: string;
  date: string;
  count: string;
  product: string;
  dimensions: string;
  sku: string;
  priceEx: string;
  vat: string;
  priceIn: string;
  noPhoto: string;
  page: string;
  validUntil: string;
  pricesNote: string;
}> = {
  nl: {
    title: "PRIJSLIJST · VERKOOP",
    intro: "Verkoopprijzen — exclusief en inclusief BTW",
    date: "Datum",
    count: "Artikelen",
    product: "Product",
    dimensions: "Afmetingen",
    sku: "Artikelnr.",
    priceEx: "Excl. BTW",
    vat: "BTW",
    priceIn: "Incl. BTW",
    noPhoto: "geen\nfoto",
    page: "Pagina",
    validUntil: "Prijzen geldig op aanvraag",
    pricesNote: "Alle prijzen in euro. Onder voorbehoud van wijzigingen.",
  },
  de: {
    title: "PREISLISTE · VERKAUF",
    intro: "Verkaufspreise — netto und brutto",
    date: "Datum",
    count: "Artikel",
    product: "Produkt",
    dimensions: "Abmessungen",
    sku: "Art.-Nr.",
    priceEx: "Netto",
    vat: "MwSt",
    priceIn: "Brutto",
    noPhoto: "kein\nFoto",
    page: "Seite",
    validUntil: "Preise gültig auf Anfrage",
    pricesNote: "Alle Preise in Euro. Änderungen vorbehalten.",
  },
  en: {
    title: "PRICE LIST · SALES",
    intro: "Sales prices — excluding and including VAT",
    date: "Date",
    count: "Items",
    product: "Product",
    dimensions: "Dimensions",
    sku: "SKU",
    priceEx: "Excl. VAT",
    vat: "VAT",
    priceIn: "Incl. VAT",
    noPhoto: "no\nphoto",
    page: "Page",
    validUntil: "Prices valid on request",
    pricesNote: "All prices in euros. Subject to change.",
  },
  es: {
    title: "LISTA DE PRECIOS · VENTA",
    intro: "Precios de venta — sin y con IVA",
    date: "Fecha",
    count: "Artículos",
    product: "Producto",
    dimensions: "Dimensiones",
    sku: "Ref.",
    priceEx: "Sin IVA",
    vat: "IVA",
    priceIn: "Con IVA",
    noPhoto: "sin\nfoto",
    page: "Página",
    validUntil: "Precios válidos bajo consulta",
    pricesNote: "Todos los precios en euros. Sujetos a cambios.",
  },
};

const eur = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

const today = (locale: PricelistLocale) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

const s = StyleSheet.create({
  page: {
    paddingHorizontal: 44,
    paddingTop: 56,
    paddingBottom: 66,
    fontSize: 8.5,
    fontFamily: "Helvetica",
    color: COMPANY.charcoal,
    backgroundColor: "#fdfaf5",
  },
  // Header (cover-stijl)
  cover: {
    backgroundColor: COMPANY.brown,
    color: COMPANY.cream,
    padding: 32,
    marginBottom: 22,
    marginHorizontal: -44,
    marginTop: -56,
    paddingHorizontal: 44,
    paddingTop: 56,
    paddingBottom: 26,
  },
  brand1: { fontFamily: "Times-Bold", fontSize: 26, letterSpacing: 6, color: COMPANY.cream },
  brand2: { fontFamily: "Times-Bold", fontSize: 26, letterSpacing: 6, color: COMPANY.cream, marginTop: -4 },
  brandLine: { width: 36, height: 1.6, backgroundColor: COMPANY.gold, marginTop: 10, marginBottom: 10 },
  tagline: { fontSize: 8, color: COMPANY.cream, letterSpacing: 2, opacity: 0.7 },
  coverFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 26, alignItems: "flex-end" },
  docTitle: { fontFamily: "Times-Italic", fontSize: 22, color: COMPANY.cream, letterSpacing: 1.5 },
  docMeta: { fontSize: 8, color: COMPANY.cream, opacity: 0.85, textAlign: "right", lineHeight: 1.5 },
  intro: {
    fontFamily: "Times-Italic",
    fontSize: 10,
    color: COMPANY.muted,
    marginBottom: 14,
    lineHeight: 1.5,
  },
  // Groeptitel
  group: {
    fontFamily: "Times-Bold",
    fontSize: 13,
    color: COMPANY.brown,
    marginTop: 12,
    marginBottom: 2,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  groupLine: { width: 28, height: 1.2, backgroundColor: COMPANY.terracotta, marginBottom: 8 },
  // Tabel
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: COMPANY.brown,
    paddingBottom: 4,
    marginTop: 4,
  },
  thText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 1,
    color: COMPANY.brown,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderColor: COMPANY.sand,
    paddingVertical: 6,
    alignItems: "center",
  },
  trAlt: { backgroundColor: "#f6f0e5" },
  cPhoto: { width: 46, marginRight: 8 },
  photoBox: {
    width: 46,
    height: 46,
    borderRadius: 4,
    backgroundColor: COMPANY.sand,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoEmpty: { fontSize: 6.5, color: COMPANY.muted, textAlign: "center" },
  cName: { flex: 3.2, paddingRight: 6 },
  cDim: { flex: 1.5, color: COMPANY.muted, fontSize: 8 },
  cSku: { flex: 1.1, color: COMPANY.terracotta, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  cPriceEx: { flex: 1.1, textAlign: "right", color: COMPANY.muted, fontSize: 8.5 },
  cVat: { flex: 0.6, textAlign: "right", color: COMPANY.muted, fontSize: 8 },
  cPriceIn: { flex: 1.2, textAlign: "right", fontFamily: "Times-Bold", fontSize: 10, color: COMPANY.brown },
  itemName: { fontFamily: "Times-Bold", fontSize: 10, color: COMPANY.charcoal, lineHeight: 1.3 },
  itemDesc: { fontSize: 7.5, color: COMPANY.muted, marginTop: 2, lineHeight: 1.35 },
  // Footer
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 28,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderColor: COMPANY.sand,
    fontSize: 7,
    color: COMPANY.muted,
    textAlign: "center",
    lineHeight: 1.6,
  },
  footerStrong: { fontFamily: "Helvetica-Bold", color: COMPANY.brown },
  pageNum: { position: "absolute", right: 44, bottom: 14, fontSize: 7, color: COMPANY.muted },
});

export interface PricelistItem {
  name: string;
  sku: string | null;
  description: string | null;
  /** Vertaalde omschrijvingen per locale (cache uit products.descriptionI18n). */
  descriptionI18n?: Partial<Record<PricelistLocale, string>> | null;
  imageUrl: string | null;
  widthMm: string | number | null;
  heightMm: string | number | null;
  lengthMm: string | number | null;
  thicknessMm: string | number | null;
  unit: string | null;
  priceEur: string | number | null;
  vatRate: number;
  /** Top-level grouping key, e.g. categorie of collectie. */
  group: string;
}

function shortDesc(desc: string | null): string | null {
  if (!desc) return null;
  const oneLine = desc.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > 110 ? oneLine.slice(0, 107) + "…" : oneLine;
}

function incl(price: number, vatPct: number): number {
  return Math.round(price * (1 + vatPct / 100) * 100) / 100;
}

function PricelistPdf({
  items,
  subtitle,
  locale,
}: {
  items: PricelistItem[];
  subtitle: string | null;
  locale: PricelistLocale;
}) {
  const L = LABELS[locale];

  // Group, behoud volgorde
  const groups = new Map<string, PricelistItem[]>();
  for (const it of items) {
    const key = it.group || "Overige";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  const footerLine = `${COMPANY.legalName} · ${COMPANY.address}`;
  const footerLine2 = `${COMPANY.email} · ${COMPANY.phone} · ${COMPANY.website}`;

  let rowCounter = 0;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Cover-header */}
        <View style={s.cover}>
          <Text style={s.brand1}>{COMPANY.wordmark1}</Text>
          <Text style={s.brand2}>{COMPANY.wordmark2}</Text>
          <View style={s.brandLine} />
          <Text style={s.tagline}>{COMPANY.tagline.toUpperCase()}</Text>
          <View style={s.coverFooter}>
            <Text style={s.docTitle}>{L.title}</Text>
            <Text style={s.docMeta}>
              {L.date}: {today(locale)}
              {"\n"}
              {L.count}: {items.length}
            </Text>
          </View>
        </View>

        {subtitle ? <Text style={s.intro}>{subtitle}</Text> : <Text style={s.intro}>{L.intro}</Text>}

        {[...groups.entries()].map(([groupName, rows]) => (
          <View key={groupName} wrap>
            <Text style={s.group}>{groupName}</Text>
            <View style={s.groupLine} />
            <View style={s.th} wrap={false}>
              <View style={s.cPhoto} />
              <Text style={[s.thText, s.cName]}>{L.product}</Text>
              <Text style={[s.thText, s.cDim]}>{L.dimensions}</Text>
              <Text style={[s.thText, s.cSku]}>{L.sku}</Text>
              <Text style={[s.thText, s.cPriceEx]}>{L.priceEx}</Text>
              <Text style={[s.thText, s.cVat]}>{L.vat}</Text>
              <Text style={[s.thText, s.cPriceIn]}>{L.priceIn}</Text>
            </View>
            {rows.map((it, i) => {
              const dim = formatDimensions(it);
              const localDesc = it.descriptionI18n?.[locale] ?? it.description;
              const desc = shortDesc(localDesc);
              const ex = Number(it.priceEur ?? 0);
              const inc = ex > 0 ? incl(ex, it.vatRate) : 0;
              const alt = rowCounter++ % 2 === 1;
              return (
                <View key={i} style={alt ? [s.tr, s.trAlt] : s.tr} wrap={false}>
                  <View style={s.cPhoto}>
                    <View style={s.photoBox}>
                      {it.imageUrl ? (
                        <PdfImage src={it.imageUrl} style={{ width: 46, height: 46, objectFit: "cover" }} />
                      ) : (
                        <Text style={s.photoEmpty}>{L.noPhoto}</Text>
                      )}
                    </View>
                  </View>
                  <View style={s.cName}>
                    <Text style={s.itemName}>{it.name}</Text>
                    {desc && <Text style={s.itemDesc}>{desc}</Text>}
                  </View>
                  <Text style={s.cDim}>{dim ?? "—"}</Text>
                  <Text style={s.cSku}>{it.sku ?? "—"}</Text>
                  <Text style={s.cPriceEx}>{ex > 0 ? eur(ex) : "—"}</Text>
                  <Text style={s.cVat}>{it.vatRate}%</Text>
                  <Text style={s.cPriceIn}>{inc > 0 ? eur(inc) : "—"}</Text>
                </View>
              );
            })}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerStrong}>{COMPANY.legalName}</Text>
          <Text>{footerLine.replace(COMPANY.legalName + " · ", "")}</Text>
          <Text>{footerLine2}</Text>
          <Text style={{ marginTop: 3, fontFamily: "Times-Italic" }}>{L.pricesNote}</Text>
        </View>
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) => `${L.page} ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderPricelistPdf(args: {
  items: PricelistItem[];
  subtitle: string | null;
  locale?: PricelistLocale;
}): Promise<Buffer> {
  return renderToBuffer(
    <PricelistPdf items={args.items} subtitle={args.subtitle} locale={args.locale ?? "nl"} />,
  );
}
