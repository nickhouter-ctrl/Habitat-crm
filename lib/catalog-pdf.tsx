/* Server-only: Habitat One productcatalogus — een visuele kaart-layout met
   grote productfoto's, in de huisstijl van de website (Sora-typografie). */
import path from "node:path";

import {
  Document,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { COMPANY } from "@/lib/company";
import type { PricelistItem, PricelistLocale } from "@/lib/pricelist-pdf";
import { formatDimensions } from "@/lib/products";

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

const LABELS: Record<PricelistLocale, {
  docLabel: string;
  headline: string;
  intro: string;
  collection: string;
  page: string;
  from: string;
  priceNote: string;
}> = {
  nl: {
    docLabel: "Catalogus",
    headline: "ONZE\nCOLLECTIE",
    intro: "Een selectie uit ons assortiment — zorgvuldig samengesteld voor binnen en buiten.",
    collection: "Collectie",
    page: "Pagina",
    from: "vanaf",
    priceNote: "Adviesprijzen incl. BTW. Onder voorbehoud van wijzigingen.",
  },
  de: {
    docLabel: "Katalog",
    headline: "UNSERE\nKOLLEKTION",
    intro: "Eine Auswahl aus unserem Sortiment — sorgfältig zusammengestellt für drinnen und draußen.",
    collection: "Kollektion",
    page: "Seite",
    from: "ab",
    priceNote: "Richtpreise inkl. MwSt. Änderungen vorbehalten.",
  },
  en: {
    docLabel: "Catalogue",
    headline: "OUR\nCOLLECTION",
    intro: "A selection from our range — carefully curated for indoors and outdoors.",
    collection: "Collection",
    page: "Page",
    from: "from",
    priceNote: "Recommended prices incl. VAT. Subject to change.",
  },
  es: {
    docLabel: "Catálogo",
    headline: "NUESTRA\nCOLECCIÓN",
    intro: "Una selección de nuestra gama — cuidadosamente elegida para interior y exterior.",
    collection: "Colección",
    page: "Página",
    from: "desde",
    priceNote: "Precios recomendados con IVA. Sujetos a cambios.",
  },
};

const eur = (v: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v || 0);

const today = (locale: PricelistLocale) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

const s = StyleSheet.create({
  /* ---------- COVER ---------- */
  cover: { fontFamily: "Sora", backgroundColor: COMPANY.brown, color: COMPANY.cream },
  coverInner: {
    paddingHorizontal: 56,
    paddingTop: 56,
    paddingBottom: 56,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  wordmark: {
    fontFamily: "Sora",
    fontWeight: 800,
    fontSize: 30,
    color: COMPANY.cream,
    lineHeight: 1.0,
    letterSpacing: -0.5,
  },
  coverHeadline: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 60,
    color: COMPANY.cream,
    lineHeight: 1.02,
    letterSpacing: -1,
    marginTop: 120,
  },
  coverMark: { width: 56, height: 1, backgroundColor: COMPANY.gold, marginTop: 34 },
  coverIntro: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 11,
    color: COMPANY.cream,
    opacity: 0.85,
    marginTop: 20,
    lineHeight: 1.7,
    maxWidth: 340,
  },
  coverDocLabel: {
    fontFamily: "Sora",
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: COMPANY.gold,
    marginTop: 22,
  },
  coverFooter: {
    borderTopWidth: 0.5,
    borderColor: "rgba(243,239,233,0.2)",
    paddingTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverCompany: {
    fontFamily: "Sora",
    fontWeight: 600,
    fontSize: 8,
    color: COMPANY.cream,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  coverContact: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 8,
    color: COMPANY.cream,
    opacity: 0.75,
    lineHeight: 1.6,
  },

  /* ---------- CONTENT ---------- */
  page: {
    paddingHorizontal: 44,
    paddingTop: 44,
    paddingBottom: 64,
    fontFamily: "Sora",
    backgroundColor: "#fdfaf5",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderColor: COMPANY.sand,
    marginBottom: 26,
  },
  pageHeaderBrand: { fontFamily: "Sora", fontWeight: 800, fontSize: 11, color: COMPANY.brown },
  pageHeaderRight: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 8.5,
    color: COMPANY.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  sectionGroup: { marginBottom: 26 },
  sectionLabel: {
    fontFamily: "Sora",
    fontWeight: 500,
    fontSize: 8,
    color: COMPANY.terracotta,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: "Sora",
    fontWeight: 700,
    fontSize: 22,
    color: COMPANY.brown,
    letterSpacing: -0.4,
  },
  sectionRule: { height: 0.5, backgroundColor: COMPANY.sand, marginTop: 12, marginBottom: 16 },

  /* ---------- CARD GRID ---------- */
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -7 },
  card: { width: "33.333%", paddingHorizontal: 7, marginBottom: 18 },
  photoBox: {
    width: "100%",
    height: 150,
    backgroundColor: "#ffffff",
    borderWidth: 0.5,
    borderColor: COMPANY.sand,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%", objectFit: "contain" },
  photoEmpty: { fontFamily: "Sora", fontWeight: 300, fontSize: 16, color: COMPANY.muted },
  cardName: {
    fontFamily: "Sora",
    fontWeight: 600,
    fontSize: 8.5,
    color: COMPANY.charcoal,
    marginTop: 7,
    lineHeight: 1.3,
  },
  cardDim: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 7,
    color: COMPANY.muted,
    marginTop: 2,
  },
  cardPrice: {
    fontFamily: "Sora",
    fontWeight: 700,
    fontSize: 9.5,
    color: COMPANY.brown,
    marginTop: 4,
  },

  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 28,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: COMPANY.sand,
    flexDirection: "row",
    justifyContent: "space-between",
    fontFamily: "Sora",
  },
  footerText: { fontFamily: "Sora", fontWeight: 300, fontSize: 7, color: COMPANY.muted },
  footerStrong: {
    fontFamily: "Sora",
    fontWeight: 700,
    fontSize: 7,
    color: COMPANY.brown,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});

function incl(price: number, vatPct: number): number {
  return Math.round(price * (1 + vatPct / 100) * 100) / 100;
}

function CatalogPdf({
  items,
  subtitle,
  locale,
}: {
  items: PricelistItem[];
  subtitle: string | null;
  locale: PricelistLocale;
}) {
  const L = LABELS[locale];

  const groups = new Map<string, PricelistItem[]>();
  for (const it of items) {
    const key = it.group || "Overige";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <Document>
      {/* -------- COVER -------- */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <View>
            <Text style={s.wordmark}>{COMPANY.wordmark1}</Text>
            <Text style={s.wordmark}>{COMPANY.wordmark2}</Text>
            <Text style={s.coverHeadline}>{L.headline}</Text>
            <View style={s.coverMark} />
            <Text style={s.coverIntro}>{L.intro}</Text>
            <Text style={s.coverDocLabel}>
              {L.docLabel}
              {subtitle ? ` — ${subtitle}` : ""} · {today(locale)}
            </Text>
          </View>
          <View style={s.coverFooter}>
            <View>
              <Text style={s.coverCompany}>{COMPANY.legalName}</Text>
              <Text style={s.coverContact}>{COMPANY.address}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.coverContact}>{COMPANY.email}</Text>
              <Text style={s.coverContact}>{COMPANY.phone}</Text>
              <Text style={s.coverContact}>{COMPANY.website}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* -------- CONTENT -------- */}
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <Text style={s.pageHeaderBrand}>HABITAT ONE</Text>
          <Text style={s.pageHeaderRight}>{L.docLabel}</Text>
        </View>

        {[...groups.entries()].map(([groupName, rows]) => (
          <View key={groupName} style={s.sectionGroup}>
            {/* Kop bij elkaar houden — niet als wees onderaan een pagina. */}
            <View wrap={false} minPresenceAhead={170}>
              <Text style={s.sectionLabel}>{L.collection}</Text>
              <Text style={s.sectionTitle}>{groupName}</Text>
              <View style={s.sectionRule} />
            </View>
            <View style={s.grid}>
              {rows.map((it, i) => {
                const dim = formatDimensions(it);
                const ex = Number(it.priceEur ?? 0);
                const price = ex > 0 ? incl(ex, it.vatRate) : 0;
                return (
                  <View key={i} style={s.card} wrap={false}>
                    <View style={s.photoBox}>
                      {it.imageUrl ? (
                        <PdfImage src={it.imageUrl} style={s.photo} />
                      ) : (
                        <Text style={s.photoEmpty}>—</Text>
                      )}
                    </View>
                    <Text style={s.cardName}>{it.name}</Text>
                    {dim && <Text style={s.cardDim}>{dim}</Text>}
                    {price > 0 && (
                      <Text style={s.cardPrice}>
                        {L.from} {eur(price)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerStrong}>{COMPANY.legalName}</Text>
          <Text
            style={s.footerText}
            render={({ pageNumber }) => `${L.priceNote}   ·   ${L.page} ${pageNumber}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function renderCatalogPdf(args: {
  items: PricelistItem[];
  subtitle: string | null;
  locale?: PricelistLocale;
}): Promise<Buffer> {
  return renderToBuffer(
    <CatalogPdf items={args.items} subtitle={args.subtitle} locale={args.locale ?? "nl"} />,
  );
}
