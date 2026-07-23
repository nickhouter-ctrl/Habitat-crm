/* Server-only: groothandels-prijsbrochure voor de Flexibel Stone wandpanelen.
   Zelfde huisstijl als de gewone prijslijst (Sora + logo's + palet). Per paneel
   staat elke maat met een eigen prijs: jouw inkoop bij Habitat + de adviesprijs
   voor de consument (ex/incl btw), elk ook per m². De groothandel bepaalt zelf
   zijn prijs aan winkels. Meertalig: nl / de / en / es. */
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

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
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

export type BrochureLocale = "nl" | "de" | "en" | "es";

const r2 = (n: number) => Math.round(n * 100) / 100;
const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v);
const today = (loc: BrochureLocale) =>
  new Intl.DateTimeFormat(loc, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

type Labels = {
  headline: string;
  intro: string;
  docLabel: string;
  runningTitle: string;
  wallPanels: string;
  chain: { strong1: string; mid: string; strong2: string; post: string };
  thSize: string;
  thCost: string;
  thAdvies: string;
  exVat: string;
  inclVat: string;
  onRequest: string;
  inStock: string;
  footerNote: string;
};

const L: Record<BrochureLocale, Labels> = {
  nl: {
    headline: "Flexibel Stone",
    intro:
      "Groothandelprijzen voor de Flexibel Stone wandpanelen, geldig bij afname per halve of hele container. Alle prijzen ex. btw (intracommunautaire levering, btw verlegd). De adviesprijs is de consumentenprijs die verkooppunten aanhouden.",
    docLabel: "Groothandelprijzen",
    runningTitle: "Groothandelprijzen",
    wallPanels: "Wandpanelen",
    chain: { strong1: "Jouw inkoopprijs", mid: " bij Habitat en de ", strong2: "adviesprijs voor de consument", post: ". Wat je aan winkels vraagt bepaal je zelf. Elke maat heeft zijn eigen prijs; prijzen gelden bij afname per halve of hele container." },
    thSize: "Maat",
    thCost: "Jouw inkoop",
    thAdvies: "Advies consument",
    exVat: "ex btw",
    inclVat: "incl btw",
    onRequest: "op aanvraag",
    inStock: "voorraad",
    footerNote:
      "Groothandelprijzen, geldig bij afname per halve/hele container. Alle bedragen ex. btw (btw verlegd). Prijzen onder voorbehoud; adviesprijs = geadviseerde consumentenprijs.",
  },
  de: {
    headline: "Flexibel Stone",
    intro:
      "Großhandelspreise für die Flexibel Stone Wandpaneele, gültig bei Abnahme pro halbem oder ganzem Container. Alle Preise exkl. MwSt (innergemeinschaftliche Lieferung, Reverse-Charge). Der empfohlene Preis ist der Verkaufspreis, den die Verkaufsstellen an Endkunden ansetzen.",
    docLabel: "Großhandelspreise",
    runningTitle: "Großhandelspreise",
    wallPanels: "Wandpaneele",
    chain: { strong1: "Ihr Einkaufspreis", mid: " bei Habitat und der ", strong2: "empfohlene Endkundenpreis", post: ". Ihren Preis an Händler bestimmen Sie selbst. Jede Größe hat ihren eigenen Preis; Preise gelten bei Abnahme pro halbem/ganzem Container." },
    thSize: "Größe",
    thCost: "Ihr Einkauf",
    thAdvies: "Empf. Endpreis",
    exVat: "exkl. MwSt",
    inclVat: "inkl. MwSt",
    onRequest: "auf Anfrage",
    inStock: "Lager",
    footerNote:
      "Großhandelspreise, gültig bei Abnahme pro halbem/ganzem Container. Alle Beträge exkl. MwSt (Reverse-Charge). Preise freibleibend; empfohlener Endkundenpreis.",
  },
  en: {
    headline: "Flexibel Stone",
    intro:
      "Wholesale prices for the Flexibel Stone wall panels, valid for orders per half or full container. All prices excl. VAT (intra-EU supply, reverse charge). The recommended price is the consumer price that points of sale maintain.",
    docLabel: "Wholesale prices",
    runningTitle: "Wholesale prices",
    wallPanels: "Wall panels",
    chain: { strong1: "Your cost price", mid: " at Habitat and the ", strong2: "recommended consumer price", post: ". You set your own price to retailers. Every size has its own price; prices valid for orders per half/full container." },
    thSize: "Size",
    thCost: "Your cost",
    thAdvies: "Recommended price",
    exVat: "excl. VAT",
    inclVat: "incl. VAT",
    onRequest: "on request",
    inStock: "in stock",
    footerNote:
      "Wholesale prices, valid for orders per half/full container. All amounts excl. VAT (reverse charge). Prices subject to change; recommended consumer price.",
  },
  es: {
    headline: "Flexibel Stone",
    intro:
      "Precios mayoristas para los paneles de pared Flexibel Stone, válidos por medio contenedor o contenedor completo. Todos los precios sin IVA (entrega intracomunitaria, inversión del sujeto pasivo). El precio recomendado es el precio de consumo que mantienen los puntos de venta.",
    docLabel: "Precios mayoristas",
    runningTitle: "Precios mayoristas",
    wallPanels: "Paneles de pared",
    chain: { strong1: "Tu precio de compra", mid: " en Habitat y el ", strong2: "precio recomendado al consumidor", post: ". El precio a tiendas lo decides tú. Cada medida tiene su propio precio; precios válidos por medio contenedor o contenedor completo." },
    thSize: "Medida",
    thCost: "Tu compra",
    thAdvies: "Precio recomendado",
    exVat: "sin IVA",
    inclVat: "con IVA",
    onRequest: "a consultar",
    inStock: "en stock",
    footerNote:
      "Precios mayoristas, válidos por medio contenedor o contenedor completo. Importes sin IVA (inversión del sujeto pasivo). Precios sujetos a cambios; precio recomendado al consumidor.",
  },
};

export type WholesaleSize = {
  dim: string;
  sku: string | null;
  areaM2: number | null;
  inkoop: number | null;
  adviesEx: number | null;
  adviesIncl: number | null;
  inStock: boolean;
};

export type WholesaleItem = {
  group: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  sizes: WholesaleSize[];
  hasInkoop: boolean;
};

export type WholesaleBrochureMeta = {
  subtitle: string;
  wholesaleMultiplier: number;
};

const s = StyleSheet.create({
  cover: { fontFamily: "Sora", backgroundColor: COMPANY.brown, color: COMPANY.cream, padding: 0 },
  coverInner: { paddingHorizontal: 56, paddingTop: 56, paddingBottom: 56, flexGrow: 1, justifyContent: "space-between" },
  coverLogo: { width: 200, height: 89, objectFit: "contain", marginBottom: 4 },
  coverHeadline: { fontFamily: "Sora", fontWeight: 300, fontSize: 56, color: COMPANY.cream, lineHeight: 1.02, letterSpacing: -1, marginTop: 92 },
  coverHeadlineMark: { width: 56, height: 1, backgroundColor: COMPANY.gold, marginTop: 30 },
  coverEyebrow: { fontFamily: "Sora", fontWeight: 500, fontSize: 9, letterSpacing: 4, textTransform: "uppercase", color: COMPANY.cream, opacity: 0.7, marginTop: 18 },
  coverIntro: { fontFamily: "Sora", fontWeight: 300, fontSize: 10.5, color: COMPANY.cream, marginTop: 22, lineHeight: 1.7, maxWidth: 400, opacity: 0.85 },
  coverDocLabel: { fontFamily: "Sora", fontWeight: 600, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: COMPANY.gold, marginTop: 24 },
  coverMeta: { fontFamily: "Sora", fontWeight: 400, fontSize: 8, color: COMPANY.cream, opacity: 0.55, letterSpacing: 2, textTransform: "uppercase" },
  coverFooter: { borderTopWidth: 0.5, borderColor: "rgba(243,239,233,0.2)", paddingTop: 14, marginTop: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  coverFooterBlock: { maxWidth: 300 },
  coverCompany: { fontFamily: "Sora", fontWeight: 600, fontSize: 8, color: COMPANY.cream, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 },
  coverContact: { fontFamily: "Sora", fontWeight: 300, fontSize: 8, color: COMPANY.cream, opacity: 0.75, lineHeight: 1.6 },

  page: { paddingHorizontal: 44, paddingTop: 40, paddingBottom: 70, fontSize: 9, fontFamily: "Sora", fontWeight: 400, color: COMPANY.charcoal, backgroundColor: "#fdfaf5" },
  pageHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomWidth: 0.5, borderColor: COMPANY.sand, marginBottom: 18 },
  pageHeaderLogo: { width: 62, height: 28, objectFit: "contain" },
  pageHeaderRight: { fontFamily: "Sora", fontWeight: 300, fontSize: 8.5, color: COMPANY.muted, letterSpacing: 1.5, textTransform: "uppercase" },

  chain: { backgroundColor: COMPANY.sand, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 12, marginBottom: 16 },
  chainText: { fontFamily: "Sora", fontWeight: 400, fontSize: 8, color: COMPANY.brown, lineHeight: 1.5 },
  chainStrong: { fontFamily: "Sora", fontWeight: 600, color: COMPANY.brown },

  sectionLabel: { fontFamily: "Sora", fontWeight: 500, fontSize: 8, color: COMPANY.terracotta, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 },
  sectionTitle: { fontFamily: "Sora", fontWeight: 700, fontSize: 17, color: COMPANY.brown, letterSpacing: -0.4, lineHeight: 1.1 },
  sectionRule: { height: 1, backgroundColor: COMPANY.brown, marginTop: 7, marginBottom: 10 },

  // Paneel-blok (kleur) met foto + naam + matentabel.
  product: { marginBottom: 12 },
  prodHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  photoBox: { width: 42, height: 42, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", overflow: "hidden", marginRight: 12, borderWidth: 0.5, borderColor: COMPANY.sand },
  photoEmpty: { fontFamily: "Sora", fontWeight: 300, fontSize: 12, color: COMPANY.muted },
  prodName: { fontFamily: "Sora", fontWeight: 700, fontSize: 12, color: COMPANY.charcoal, letterSpacing: -0.2 },
  prodSku: { fontFamily: "Sora", fontWeight: 600, fontSize: 7.5, color: COMPANY.terracotta, letterSpacing: 0.4, marginTop: 2 },

  table: { marginLeft: 54 },
  th: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: COMPANY.sand, paddingBottom: 4, marginBottom: 1 },
  thSize: { flex: 2.4, fontFamily: "Sora", fontWeight: 600, fontSize: 6.6, letterSpacing: 0.6, color: COMPANY.brown, textTransform: "uppercase" },
  thNum: { flex: 1.5, textAlign: "right", paddingRight: 8, fontFamily: "Sora", fontWeight: 600, fontSize: 6.6, letterSpacing: 0.6, color: COMPANY.brown, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottomWidth: 0.3, borderColor: "#efe7d9", paddingTop: 4, paddingBottom: 4, alignItems: "center" },

  cDim: { flex: 2.4, flexDirection: "row", alignItems: "center" },
  dimText: { fontFamily: "Sora", fontWeight: 500, fontSize: 9.5, color: COMPANY.charcoal },
  stockTag: { fontFamily: "Sora", fontWeight: 600, fontSize: 6, color: COMPANY.sage, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 6, borderWidth: 0.5, borderColor: COMPANY.sage, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 },

  colNumBox: { flex: 1.5, paddingRight: 8, alignItems: "flex-end", justifyContent: "center" },
  numStrong: { fontFamily: "Sora", fontWeight: 700, fontSize: 10, color: COMPANY.brown },
  numReg: { fontFamily: "Sora", fontWeight: 400, fontSize: 9, color: COMPANY.muted },
  perM2: { fontFamily: "Sora", fontWeight: 300, fontSize: 6.4, color: COMPANY.muted, marginTop: 1 },
  onAanvraag: { fontFamily: "Sora", fontWeight: 400, fontSize: 7.5, color: COMPANY.muted },

  footer: { position: "absolute", left: 44, right: 44, bottom: 28, paddingTop: 10, borderTopWidth: 0.5, borderColor: COMPANY.sand, fontSize: 7, color: COMPANY.muted, textAlign: "center", lineHeight: 1.6, fontFamily: "Sora", fontWeight: 400 },
  footerStrong: { fontFamily: "Sora", fontWeight: 700, color: COMPANY.brown, letterSpacing: 1.5 },
  footerNote: { fontFamily: "Sora", fontWeight: 300, fontSize: 6.6, color: COMPANY.muted, marginTop: 3 },
  pageNum: { position: "absolute", bottom: 14, right: 44, fontSize: 7, color: COMPANY.muted, fontFamily: "Sora" },
});

function PriceCell({ main, area, strong }: { main: number | null; area: number | null; strong: boolean }) {
  return (
    <View style={s.colNumBox}>
      <Text style={strong ? s.numStrong : s.numReg}>{eur(main)}</Text>
      {main != null && area && area > 0 ? <Text style={s.perM2}>{eur(r2(main / area))}/m²</Text> : null}
    </View>
  );
}

function ProductBlock({ item, t }: { item: WholesaleItem; t: Labels }) {
  // Serie-naam vooraan de kleurnaam weglaten ("Italian Travertine - Yellow Wood" → "Yellow Wood").
  let display = item.name;
  const pref = `${item.group} - `;
  if (display.startsWith(pref)) display = display.slice(pref.length);
  else if (display.startsWith(`${item.group}  - `)) display = display.slice(`${item.group}  - `.length);

  return (
    <View style={s.product} wrap={false}>
      <View style={s.prodHeader}>
        <View style={s.photoBox}>
          {item.imageUrl ? (
            <PdfImage src={item.imageUrl} style={{ width: 42, height: 42, objectFit: "cover" }} />
          ) : (
            <Text style={s.photoEmpty}>—</Text>
          )}
        </View>
        <View>
          <Text style={s.prodName}>{display}</Text>
          {item.sku && <Text style={s.prodSku}>{item.sku}</Text>}
        </View>
      </View>

      <View style={s.table}>
        <View style={s.th}>
          <Text style={s.thSize}>{t.thSize}</Text>
          <Text style={s.thNum}>{t.thCost}{"\n"}({t.exVat})</Text>
          <Text style={s.thNum}>{t.thAdvies}{"\n"}({t.exVat})</Text>
          <Text style={s.thNum}>{t.thAdvies}{"\n"}({t.inclVat})</Text>
        </View>
        {item.sizes.map((sz, i) => (
          <View key={i} style={s.tr}>
            <View style={s.cDim}>
              <Text style={s.dimText}>{sz.dim}</Text>
              {sz.inStock && <Text style={s.stockTag}>{t.inStock}</Text>}
            </View>
            {sz.inkoop != null ? (
              <PriceCell main={sz.inkoop} area={sz.areaM2} strong />
            ) : (
              <View style={s.colNumBox}>
                <Text style={s.onAanvraag}>{t.onRequest}</Text>
              </View>
            )}
            <PriceCell main={sz.adviesEx} area={sz.areaM2} strong={false} />
            <PriceCell main={sz.adviesIncl} area={sz.areaM2} strong />
          </View>
        ))}
      </View>
    </View>
  );
}

function Brochure({ items, meta, locale }: { items: WholesaleItem[]; meta: WholesaleBrochureMeta; locale: BrochureLocale }) {
  const t = L[locale];
  const groups = new Map<string, WholesaleItem[]>();
  for (const it of items) {
    const key = it.group || "Overige";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const groupEntries = [...groups.entries()];

  return (
    <Document>
      {/* -------- COVER -------- */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <View>
            <PdfImage src={LOGO_CREAM} style={s.coverLogo} />
            <Text style={s.coverHeadline}>{t.headline}</Text>
            <View style={s.coverHeadlineMark} />
            <Text style={s.coverEyebrow}>{COMPANY.tagline.toUpperCase()}</Text>
            <Text style={s.coverIntro}>{t.intro}</Text>
            <Text style={s.coverDocLabel}>
              {t.docLabel} — {meta.subtitle}
            </Text>
          </View>
          <View>
            <Text style={s.coverMeta}>{today(locale)}</Text>
            <View style={s.coverFooter}>
              <View style={s.coverFooterBlock}>
                <Text style={s.coverCompany}>{COMPANY.legalName}</Text>
                <Text style={s.coverContact}>{COMPANY.address}</Text>
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

      {/* -------- CONTENT (landscape) -------- */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.pageHeader} fixed>
          <PdfImage src={LOGO_DARK} style={s.pageHeaderLogo} />
          <Text style={s.pageHeaderRight}>{t.runningTitle} · {today(locale)}</Text>
        </View>

        <View style={s.chain}>
          <Text style={s.chainText}>
            <Text style={s.chainStrong}>{t.chain.strong1}</Text>
            {t.chain.mid}
            <Text style={s.chainStrong}>{t.chain.strong2}</Text>
            {t.chain.post}
          </Text>
        </View>

        {groupEntries.map(([groupName, prods], gi) => (
          <View key={groupName} break={gi > 0}>
            <View wrap={false}>
              <Text style={s.sectionLabel}>{t.wallPanels}</Text>
              <Text style={s.sectionTitle}>{groupName}</Text>
              <View style={s.sectionRule} />
            </View>
            {prods.map((it, i) => (
              <ProductBlock key={i} item={it} t={t} />
            ))}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerStrong}>{COMPANY.legalName}</Text>
          <Text>
            {COMPANY.address} · {COMPANY.email} · {COMPANY.phone}
          </Text>
          <Text style={s.footerNote}>{t.footerNote}</Text>
        </View>
        <Text
          style={s.pageNum}
          render={({ pageNumber, totalPages }) => (pageNumber === 1 ? "" : `${pageNumber} / ${totalPages}`)}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderWholesaleBrochure(args: {
  items: WholesaleItem[];
  meta: WholesaleBrochureMeta;
  locale?: BrochureLocale;
}): Promise<Buffer> {
  return renderToBuffer(<Brochure items={args.items} meta={args.meta} locale={args.locale ?? "nl"} />);
}
