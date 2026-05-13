/* Server-only: rendert een luxe-Mediterrane prijslijst — magazine-stijl met cover. */
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
  docTitle: string;
  coverSubtitle: string;
  coverIntro: string;
  collection: string;
  product: string;
  dimensions: string;
  sku: string;
  priceEx: string;
  vat: string;
  priceIn: string;
  noPhoto: string;
  page: string;
  date: string;
  pricesNote: string;
}> = {
  nl: {
    docTitle: "Prijslijst",
    coverSubtitle: "Verkoop",
    coverIntro:
      "Een selectie uit ons assortiment Magic Stone wandpanelen, badkamer-collectie en accessoires. " +
      "Alle prijzen in euro — exclusief en inclusief BTW.",
    collection: "Collectie",
    product: "Product",
    dimensions: "Afmetingen",
    sku: "Artikelnr.",
    priceEx: "Excl. BTW",
    vat: "BTW",
    priceIn: "Incl. BTW",
    noPhoto: "—",
    page: "Pagina",
    date: "Datum",
    pricesNote: "Alle prijzen in euro. Onder voorbehoud van wijzigingen.",
  },
  de: {
    docTitle: "Preisliste",
    coverSubtitle: "Verkauf",
    coverIntro:
      "Eine Auswahl aus unserem Sortiment Magic Stone Wandpaneele, Badkollektion und Accessoires. " +
      "Alle Preise in Euro — netto und brutto.",
    collection: "Kollektion",
    product: "Produkt",
    dimensions: "Abmessungen",
    sku: "Art.-Nr.",
    priceEx: "Netto",
    vat: "MwSt",
    priceIn: "Brutto",
    noPhoto: "—",
    page: "Seite",
    date: "Datum",
    pricesNote: "Alle Preise in Euro. Änderungen vorbehalten.",
  },
  en: {
    docTitle: "Price List",
    coverSubtitle: "Sales",
    coverIntro:
      "A selection from our Magic Stone wall panels, bathroom collection and accessories. " +
      "All prices in euros — excluding and including VAT.",
    collection: "Collection",
    product: "Product",
    dimensions: "Dimensions",
    sku: "SKU",
    priceEx: "Excl. VAT",
    vat: "VAT",
    priceIn: "Incl. VAT",
    noPhoto: "—",
    page: "Page",
    date: "Date",
    pricesNote: "All prices in euros. Subject to change.",
  },
  es: {
    docTitle: "Lista de Precios",
    coverSubtitle: "Venta",
    coverIntro:
      "Una selección de nuestros paneles de pared Magic Stone, colección de baño y accesorios. " +
      "Todos los precios en euros — sin y con IVA.",
    collection: "Colección",
    product: "Producto",
    dimensions: "Dimensiones",
    sku: "Ref.",
    priceEx: "Sin IVA",
    vat: "IVA",
    priceIn: "Con IVA",
    noPhoto: "—",
    page: "Página",
    date: "Fecha",
    pricesNote: "Todos los precios en euros. Sujetos a cambios.",
  },
};

const eur = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

const today = (locale: PricelistLocale) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

const s = StyleSheet.create({
  // ---------- COVER ----------
  cover: {
    fontFamily: "Helvetica",
    backgroundColor: COMPANY.brown,
    color: COMPANY.cream,
    padding: 0,
  },
  coverInner: {
    paddingHorizontal: 56,
    paddingTop: 120,
    paddingBottom: 56,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  coverTopGold: { width: 60, height: 2, backgroundColor: COMPANY.gold },
  brand1: { fontFamily: "Times-Bold", fontSize: 44, letterSpacing: 14, color: COMPANY.cream, marginTop: 32 },
  brand2: { fontFamily: "Times-Bold", fontSize: 44, letterSpacing: 14, color: COMPANY.cream, marginTop: -6 },
  tagline: { fontSize: 9, color: COMPANY.cream, opacity: 0.7, marginTop: 18, letterSpacing: 4 },
  coverDivider: { width: 80, height: 1, backgroundColor: COMPANY.gold, marginTop: 64 },
  coverDocTitle: { fontFamily: "Times-Italic", fontSize: 56, color: COMPANY.cream, marginTop: 24, letterSpacing: 1 },
  coverSubtitle: { fontFamily: "Helvetica", fontSize: 11, letterSpacing: 8, color: COMPANY.gold, marginTop: 12, textTransform: "uppercase" },
  coverIntro: { fontFamily: "Times-Italic", fontSize: 12, color: COMPANY.cream, marginTop: 36, lineHeight: 1.7, maxWidth: 380, opacity: 0.92 },
  coverMeta: { fontSize: 8.5, color: COMPANY.cream, opacity: 0.65, letterSpacing: 2, textTransform: "uppercase" },
  coverFooter: { borderTopWidth: 0.5, borderColor: "rgba(243,239,233,0.25)", paddingTop: 14, marginTop: 32 },
  coverCompany: { fontFamily: "Helvetica-Bold", fontSize: 8.5, color: COMPANY.cream, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  coverContact: { fontSize: 8.5, color: COMPANY.cream, opacity: 0.75, lineHeight: 1.6 },

  // ---------- CONTENT PAGES ----------
  page: {
    paddingHorizontal: 56,
    paddingTop: 56,
    paddingBottom: 78,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COMPANY.charcoal,
    backgroundColor: "#fdfaf5",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderColor: COMPANY.sand,
    marginBottom: 28,
  },
  pageHeaderBrand: { fontFamily: "Times-Bold", fontSize: 11, letterSpacing: 4, color: COMPANY.brown },
  pageHeaderRight: { fontFamily: "Times-Italic", fontSize: 9, color: COMPANY.muted },

  // ---------- SECTION ----------
  sectionGroup: { marginBottom: 36 },
  sectionLabel: { fontSize: 8, color: COMPANY.terracotta, letterSpacing: 4, textTransform: "uppercase", marginBottom: 6 },
  sectionTitle: { fontFamily: "Times-Bold", fontSize: 26, color: COMPANY.brown, letterSpacing: 0.5, lineHeight: 1.1 },
  sectionGold: { width: 40, height: 1.4, backgroundColor: COMPANY.gold, marginTop: 10, marginBottom: 18 },

  // ---------- TABLE ----------
  th: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderColor: COMPANY.brown,
    paddingBottom: 6,
    marginBottom: 4,
  },
  thText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.8,
    letterSpacing: 1.2,
    color: COMPANY.brown,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.35,
    borderColor: COMPANY.sand,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "center",
  },
  cPhoto: { width: 78, marginRight: 14 },
  photoBox: {
    width: 78,
    height: 78,
    borderRadius: 4,
    backgroundColor: COMPANY.sand,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoEmpty: { fontSize: 18, color: COMPANY.muted, textAlign: "center" },
  cName: { flex: 3.2, paddingRight: 8 },
  cDim: { flex: 1.6, color: COMPANY.muted, fontSize: 8.5, fontFamily: "Times-Italic" },
  cSku: { flex: 1.1, color: COMPANY.terracotta, fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  cPriceEx: { flex: 1.1, textAlign: "right", color: COMPANY.muted, fontSize: 9 },
  cVat: { flex: 0.6, textAlign: "right", color: COMPANY.muted, fontSize: 8 },
  cPriceIn: { flex: 1.3, textAlign: "right", fontFamily: "Times-Bold", fontSize: 12, color: COMPANY.brown },
  itemName: { fontFamily: "Times-Bold", fontSize: 12, color: COMPANY.charcoal, lineHeight: 1.25 },
  itemDesc: { fontSize: 8, color: COMPANY.muted, marginTop: 3, lineHeight: 1.4, fontFamily: "Times-Italic" },

  // ---------- FOOTER ----------
  footer: {
    position: "absolute",
    left: 56,
    right: 56,
    bottom: 32,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: COMPANY.sand,
    fontSize: 7,
    color: COMPANY.muted,
    textAlign: "center",
    lineHeight: 1.6,
    fontFamily: "Helvetica",
  },
  footerStrong: { fontFamily: "Helvetica-Bold", color: COMPANY.brown, letterSpacing: 1, textTransform: "uppercase" },
  footerNote: { marginTop: 4, fontFamily: "Times-Italic", color: COMPANY.muted, fontSize: 7.5 },
  pageNum: { position: "absolute", right: 56, bottom: 14, fontSize: 7.5, color: COMPANY.muted, fontFamily: "Times-Italic" },
});

export interface PricelistItem {
  name: string;
  sku: string | null;
  description: string | null;
  descriptionI18n?: Partial<Record<PricelistLocale, string>> | null;
  imageUrl: string | null;
  widthMm: string | number | null;
  heightMm: string | number | null;
  lengthMm: string | number | null;
  thicknessMm: string | number | null;
  unit: string | null;
  priceEur: string | number | null;
  vatRate: number;
  group: string;
}

function shortDesc(desc: string | null): string | null {
  if (!desc) return null;
  const oneLine = desc.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > 130 ? oneLine.slice(0, 127) + "…" : oneLine;
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
  const groupEntries = [...groups.entries()];

  return (
    <Document>
      {/* -------- COVER PAGE -------- */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <View>
            <View style={s.coverTopGold} />
            <Text style={s.brand1}>{COMPANY.wordmark1}</Text>
            <Text style={s.brand2}>{COMPANY.wordmark2}</Text>
            <Text style={s.tagline}>{COMPANY.tagline.toUpperCase()}</Text>

            <View style={s.coverDivider} />
            <Text style={s.coverDocTitle}>{L.docTitle}</Text>
            <Text style={s.coverSubtitle}>{L.coverSubtitle}</Text>
            <Text style={s.coverIntro}>{L.coverIntro}</Text>
            {subtitle && (
              <Text style={[s.coverIntro, { fontSize: 10, marginTop: 16, opacity: 0.8 }]}>
                — {subtitle}
              </Text>
            )}
          </View>

          <View>
            <Text style={s.coverMeta}>
              {L.date}: {today(locale)}
            </Text>
            <View style={s.coverFooter}>
              <Text style={s.coverCompany}>{COMPANY.legalName}</Text>
              <Text style={s.coverContact}>
                {COMPANY.address}
                {"\n"}
                {COMPANY.email} · {COMPANY.phone} · {COMPANY.website}
              </Text>
            </View>
          </View>
        </View>
      </Page>

      {/* -------- CONTENT PAGES -------- */}
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <Text style={s.pageHeaderBrand}>HABITAT ONE</Text>
          <Text style={s.pageHeaderRight}>
            {L.docTitle} {L.coverSubtitle.toLowerCase()} · {today(locale)}
          </Text>
        </View>

        {groupEntries.map(([groupName, rows], gi) => (
          <View key={groupName} style={s.sectionGroup} break={gi > 0}>
            <Text style={s.sectionLabel}>{L.collection}</Text>
            <Text style={s.sectionTitle}>{groupName}</Text>
            <View style={s.sectionGold} />

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
              return (
                <View key={i} style={s.tr} wrap={false}>
                  <View style={s.cPhoto}>
                    <View style={s.photoBox}>
                      {it.imageUrl ? (
                        <PdfImage src={it.imageUrl} style={{ width: 78, height: 78, objectFit: "cover" }} />
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
          <Text>
            {COMPANY.address} · {COMPANY.email} · {COMPANY.phone}
          </Text>
          <Text style={s.footerNote}>{L.pricesNote}</Text>
        </View>
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) =>
            pageNumber === 1 ? "" : `${L.page} ${pageNumber} / ${totalPages}`
          }
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
