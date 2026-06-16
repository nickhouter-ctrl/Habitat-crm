/* Server-only: rendert een Habitat One prijslijst — geïnspireerd op de
   website-typografie (Sora) met een rustige, magazine-achtige opzet. */
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
import { formatDimensions } from "@/lib/products";

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
// Het echte website-logo: donkere versie voor lichte vlakken, cream voor donkere.
const LOGO_DARK = path.join(process.cwd(), "public", "brand", "habitat-one-logo.png");
const LOGO_CREAM = path.join(process.cwd(), "public", "brand", "habitat-one-logo-cream.png");

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

export type PricelistLocale = "nl" | "de" | "en" | "es";

const GROUP_TRANSLATIONS: Record<string, Record<PricelistLocale, string>> = {
  "Wandpanelen": { nl: "Wandpanelen", de: "Wandpaneele", en: "Wall Panels", es: "Paneles de Pared" },
  "Badkamer": { nl: "Badkamer", de: "Bad", en: "Bathroom", es: "Baño" },
  "Badkamer accessoires": { nl: "Badkamer accessoires", de: "Bad-Zubehör", en: "Bathroom Accessories", es: "Accesorios de Baño" },
  "Binnen en buiten deuren": { nl: "Binnen en buiten deuren", de: "Innen- und Außentüren", en: "Interior & Exterior Doors", es: "Puertas Interiores y Exteriores" },
  "Accessoires": { nl: "Accessoires", de: "Zubehör", en: "Accessories", es: "Accesorios" },
  "Binnendeuren": { nl: "Binnendeuren", de: "Innentüren", en: "Interior Doors", es: "Puertas Interiores" },
  "Buitendeuren": { nl: "Buitendeuren", de: "Außentüren", en: "Exterior Doors", es: "Puertas Exteriores" },
  "Beslag": { nl: "Beslag", de: "Beschläge", en: "Hardware", es: "Herrajes" },
  "Overige": { nl: "Overige", de: "Sonstige", en: "Other", es: "Otros" },
  "Bloempotten": { nl: "Bloempotten", de: "Blumentöpfe", en: "Flower Pots", es: "Macetas" },
  "Tuinmeubilair": { nl: "Tuinmeubilair", de: "Gartenmöbel", en: "Garden Furniture", es: "Mobiliario de Jardín" },
  "Loungers": { nl: "Loungers", de: "Sonnenliegen", en: "Loungers", es: "Tumbonas" },
  // Nieuwe collecties (2026-06)
  "Verlichting": { nl: "Verlichting", de: "Beleuchtung", en: "Lighting", es: "Iluminación" },
  "Rail-verlichting": { nl: "Rail-verlichting", de: "Schienenbeleuchtung", en: "Track Lighting", es: "Iluminación de Carril" },
  "Wandspots": { nl: "Wandspots", de: "Wandstrahler", en: "Wall Spots", es: "Focos de Pared" },
  "Grondspots": { nl: "Grondspots", de: "Bodenstrahler", en: "Ground Spots", es: "Focos de Suelo" },
  "Schakelaars & stopcontacten": { nl: "Schakelaars & stopcontacten", de: "Schalter & Steckdosen", en: "Switches & Sockets", es: "Interruptores y Enchufes" },
  "Schakelaars, stopcontacten & dimmers": { nl: "Schakelaars, stopcontacten & dimmers", de: "Schalter, Steckdosen & Dimmer", en: "Switches, Sockets & Dimmers", es: "Interruptores, Enchufes y Reguladores" },
  "Sfeerhaarden": { nl: "Sfeerhaarden", de: "Wasserdampf-Kamine", en: "Fireplaces", es: "Chimeneas" },
  "Waterdamphaard": { nl: "Waterdamphaard", de: "Wasserdampf-Kamin", en: "Water Vapour Fireplace", es: "Chimenea de Vapor de Agua" },
  "XPS montageplaten": { nl: "XPS montageplaten", de: "XPS-Montageplatten", en: "XPS Backer Boards", es: "Placas de Montaje XPS" },
  "Acrylpanelen": { nl: "Acrylpanelen", de: "Acrylplatten", en: "Acrylic Panels", es: "Paneles Acrílicos" },
};

export function translateGroup(name: string, locale: PricelistLocale): string {
  return GROUP_TRANSLATIONS[name]?.[locale] ?? name;
}

const LABELS: Record<PricelistLocale, {
  docTitle: string;
  coverHeadline: string;
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
    coverHeadline: "SELECT\nDESIGN\nLIVE",
    coverSubtitle: "Verkoop",
    coverIntro:
      "Een selectie uit ons assortiment Magic Stone wandpanelen, badkamer-collectie en accessoires. Alle prijzen in euro — exclusief en inclusief BTW.",
    collection: "Collectie",
    product: "Product",
    dimensions: "Maten",
    sku: "Artikelnr.",
    priceEx: "Excl.",
    vat: "%",
    priceIn: "Incl.",
    noPhoto: "—",
    page: "Pagina",
    date: "Datum",
    pricesNote: "Alle prijzen in euro, incl. BTW (21% tenzij anders vermeld). Onder voorbehoud van wijzigingen.",
  },
  de: {
    docTitle: "Preisliste",
    coverHeadline: "SELECT\nDESIGN\nLIVE",
    coverSubtitle: "Verkauf",
    coverIntro:
      "Eine Auswahl aus unserem Sortiment Magic Stone Wandpaneele, Badkollektion und Accessoires. Alle Preise in Euro — netto und brutto.",
    collection: "Kollektion",
    product: "Produkt",
    dimensions: "Maße",
    sku: "Art.-Nr.",
    priceEx: "Netto",
    vat: "%",
    priceIn: "Brutto",
    noPhoto: "—",
    page: "Seite",
    date: "Datum",
    pricesNote: "Alle Preise in Euro, inkl. MwSt. (21%). Änderungen vorbehalten.",
  },
  en: {
    docTitle: "Price List",
    coverHeadline: "SEE\nFEEL\nEXPERIENCE",
    coverSubtitle: "Sales",
    coverIntro:
      "A selection from our Magic Stone wall panels, bathroom collection and accessories. All prices in euros — excluding and including VAT.",
    collection: "Collection",
    product: "Product",
    dimensions: "Size",
    sku: "SKU",
    priceEx: "Net",
    vat: "%",
    priceIn: "Gross",
    noPhoto: "—",
    page: "Page",
    date: "Date",
    pricesNote: "All prices in euros, incl. VAT (21% unless stated). Subject to change.",
  },
  es: {
    docTitle: "Lista de Precios",
    coverHeadline: "VER\nSENTIR\nVIVIR",
    coverSubtitle: "Venta",
    coverIntro:
      "Una selección de nuestros paneles de pared Magic Stone, colección de baño y accesorios. Todos los precios en euros — sin y con IVA.",
    collection: "Colección",
    product: "Producto",
    dimensions: "Medidas",
    sku: "Ref.",
    priceEx: "Sin IVA",
    vat: "%",
    priceIn: "Con IVA",
    noPhoto: "—",
    page: "Página",
    date: "Fecha",
    pricesNote: "Todos los precios en euros, IVA (21%) incluido. Sujetos a cambios.",
  },
};

const eur = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

const today = (locale: PricelistLocale) =>
  new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

const s = StyleSheet.create({
  // ---------- COVER ----------
  cover: {
    fontFamily: "Sora",
    backgroundColor: COMPANY.brown,
    color: COMPANY.cream,
    padding: 0,
  },
  coverInner: {
    paddingHorizontal: 56,
    paddingTop: 56,
    paddingBottom: 56,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  coverWordmark: {
    fontFamily: "Sora",
    fontWeight: 800,
    fontSize: 30,
    color: COMPANY.cream,
    lineHeight: 1.0,
    letterSpacing: -0.5,
  },
  coverLogo: { width: 200, height: 89, objectFit: "contain", marginBottom: 4 },
  pageHeaderLogo: { width: 62, height: 28, objectFit: "contain" },
  coverHeadline: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 64,
    color: COMPANY.cream,
    lineHeight: 1.0,
    letterSpacing: -1,
    marginTop: 110,
  },
  coverHeadlineMark: {
    width: 56,
    height: 1,
    backgroundColor: COMPANY.gold,
    marginTop: 36,
  },
  coverEyebrow: {
    fontFamily: "Sora",
    fontWeight: 500,
    fontSize: 9,
    letterSpacing: 4,
    textTransform: "uppercase",
    color: COMPANY.cream,
    opacity: 0.7,
    marginTop: 18,
  },
  coverIntro: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 11,
    color: COMPANY.cream,
    marginTop: 22,
    lineHeight: 1.7,
    maxWidth: 360,
    opacity: 0.85,
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
  coverMeta: {
    fontFamily: "Sora",
    fontWeight: 400,
    fontSize: 8,
    color: COMPANY.cream,
    opacity: 0.55,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  coverFooter: {
    borderTopWidth: 0.5,
    borderColor: "rgba(243,239,233,0.2)",
    paddingTop: 14,
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverFooterBlock: { maxWidth: 260 },
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

  // ---------- CONTENT PAGES ----------
  page: {
    paddingHorizontal: 56,
    paddingTop: 48,
    paddingBottom: 78,
    fontSize: 9,
    fontFamily: "Sora",
    fontWeight: 400,
    color: COMPANY.charcoal,
    backgroundColor: "#fdfaf5",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderColor: COMPANY.sand,
    marginBottom: 32,
  },
  pageHeaderBrand: {
    fontFamily: "Sora",
    fontWeight: 800,
    fontSize: 11,
    letterSpacing: 0,
    color: COMPANY.brown,
  },
  pageHeaderRight: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 8.5,
    color: COMPANY.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // ---------- SECTION ----------
  sectionGroup: { marginBottom: 40 },
  sectionLabel: {
    fontFamily: "Sora",
    fontWeight: 500,
    fontSize: 8,
    color: COMPANY.terracotta,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Sora",
    fontWeight: 700,
    fontSize: 24,
    color: COMPANY.brown,
    letterSpacing: -0.4,
    lineHeight: 1.1,
  },
  sectionRule: {
    height: 0.5,
    backgroundColor: COMPANY.sand,
    marginTop: 14,
    marginBottom: 18,
  },

  // ---------- TABLE ----------
  th: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: COMPANY.brown,
    paddingBottom: 8,
    marginBottom: 4,
  },
  thText: {
    fontFamily: "Sora",
    fontWeight: 600,
    fontSize: 6.6,
    letterSpacing: 0.8,
    color: COMPANY.brown,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.3,
    borderColor: COMPANY.sand,
    paddingTop: 14,
    paddingBottom: 14,
    alignItems: "center",
  },
  cPhoto: { width: 70, marginRight: 14 },
  photoBox: {
    width: 70,
    height: 70,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  photoEmpty: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 14,
    color: COMPANY.muted,
    textAlign: "center",
  },
  cName: { flex: 2.2, paddingRight: 12, overflow: "hidden" },
  cDim: {
    flex: 1.4,
    paddingRight: 10,
    color: COMPANY.muted,
    fontSize: 8.5,
    fontFamily: "Sora",
    fontWeight: 300,
    overflow: "hidden",
  },
  cSku: {
    flex: 1.3,
    paddingRight: 10,
    color: COMPANY.terracotta,
    fontSize: 8,
    fontFamily: "Sora",
    fontWeight: 600,
    letterSpacing: 0.4,
    overflow: "hidden",
  },
  cPriceEx: {
    flex: 1.1,
    paddingRight: 6,
    textAlign: "right",
    color: COMPANY.muted,
    fontSize: 9,
    fontFamily: "Sora",
    fontWeight: 400,
    overflow: "hidden",
  },
  cVat: {
    flex: 0.5,
    paddingRight: 6,
    textAlign: "right",
    color: COMPANY.muted,
    fontSize: 8,
    fontFamily: "Sora",
    fontWeight: 400,
  },
  cPriceIn: {
    flex: 1.5,
    textAlign: "right",
    fontFamily: "Sora",
    fontWeight: 700,
    fontSize: 12,
    color: COMPANY.brown,
    overflow: "hidden",
  },
  itemName: {
    fontFamily: "Sora",
    fontWeight: 600,
    fontSize: 11,
    color: COMPANY.charcoal,
    lineHeight: 1.3,
    letterSpacing: -0.2,
  },
  itemDesc: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 8,
    color: COMPANY.muted,
    marginTop: 4,
    lineHeight: 1.5,
  },
  itemExtraSize: {
    fontFamily: "Sora",
    fontWeight: 300,
    fontSize: 7.5,
    color: COMPANY.muted,
    marginTop: 2,
  },

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
    fontFamily: "Sora",
    fontWeight: 400,
  },
  footerStrong: {
    fontFamily: "Sora",
    fontWeight: 700,
    color: COMPANY.brown,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontSize: 7.5,
  },
  footerNote: {
    marginTop: 4,
    fontFamily: "Sora",
    fontWeight: 300,
    color: COMPANY.muted,
    fontSize: 7.5,
  },
  pageNum: {
    position: "absolute",
    right: 56,
    bottom: 14,
    fontSize: 7.5,
    color: COMPANY.muted,
    fontFamily: "Sora",
    fontWeight: 300,
    letterSpacing: 1,
  },
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
  additionalSizes?: Array<{ sku: string; label: string }> | null;
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
            <PdfImage src={LOGO_CREAM} style={s.coverLogo} />

            <Text style={s.coverHeadline}>{L.coverHeadline}</Text>
            <View style={s.coverHeadlineMark} />
            <Text style={s.coverEyebrow}>{COMPANY.tagline.toUpperCase()}</Text>
            <Text style={s.coverIntro}>{L.coverIntro}</Text>
            <Text style={s.coverDocLabel}>
              {L.docTitle} — {L.coverSubtitle}
            </Text>
            {subtitle && (
              <Text style={[s.coverIntro, { fontSize: 9.5, marginTop: 10, opacity: 0.7 }]}>
                {subtitle}
              </Text>
            )}
          </View>

          <View>
            <Text style={s.coverMeta}>
              {L.date}: {today(locale)}
            </Text>
            <View style={s.coverFooter}>
              <View style={s.coverFooterBlock}>
                <Text style={s.coverCompany}>{COMPANY.legalName}</Text>
                <Text style={s.coverContact}>
                  {COMPANY.address}
                </Text>
              </View>
              <View style={[s.coverFooterBlock, { alignItems: "flex-end" }]}>
                <Text style={s.coverContact}>{COMPANY.email}</Text>
                <Text style={s.coverContact}>{COMPANY.phone}</Text>
                <Text style={s.coverContact}>{COMPANY.website}</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>

      {/* -------- CONTENT PAGES -------- */}
      <Page size="A4" style={s.page}>
        <View style={s.pageHeader} fixed>
          <PdfImage src={LOGO_DARK} style={s.pageHeaderLogo} />
          <Text style={s.pageHeaderRight}>
            {L.docTitle} · {today(locale)}
          </Text>
        </View>

        {groupEntries.map(([groupName, rows], gi) => (
          <View key={groupName} style={s.sectionGroup} break={gi > 0}>
            <Text style={s.sectionLabel}>{L.collection}</Text>
            <Text style={s.sectionTitle}>{translateGroup(groupName, locale)}</Text>
            <View style={s.sectionRule} />

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
              const extraSizes = (it.additionalSizes ?? []).filter((x) => x?.label);
              return (
                <View key={i} style={s.tr} wrap={false}>
                  <View style={s.cPhoto}>
                    <View style={s.photoBox}>
                      {it.imageUrl ? (
                        <PdfImage src={it.imageUrl} style={{ width: 70, height: 70, objectFit: "contain" }} />
                      ) : (
                        <Text style={s.photoEmpty}>{L.noPhoto}</Text>
                      )}
                    </View>
                  </View>
                  <View style={s.cName}>
                    <Text style={s.itemName}>{it.name}</Text>
                    {desc && <Text style={s.itemDesc}>{desc}</Text>}
                  </View>
                  <View style={s.cDim}>
                    <Text>{dim ?? "—"}</Text>
                    {extraSizes.map((x, j) => (
                      <Text key={j} style={s.itemExtraSize}>
                        {x.sku ? `${x.sku} · ` : ""}{x.label}
                      </Text>
                    ))}
                  </View>
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
