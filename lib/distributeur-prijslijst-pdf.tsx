/* Server-only: prijslijst voor verkooppunten (distributeurs) van Flexibel Stone.
   Zelfde huisstijl als de gewone prijslijst en de groothandelsbrochure.

   Dit is een ander document dan de B2B-lijst voor architecten en bouwbedrijven:
   een verkooppunt koopt in om door te verkopen en krijgt daarom een betere
   prijs. De adviesprijs ligt vast — daar hangt de hele lijst aan: 50% ervan is
   de inkoopprijs van het verkooppunt, 30% ervan is showroommateriaal.
   Meertalig: nl / de / en / es. */
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
import type { DistributeurItem } from "@/lib/distributeur-prijslijst-data";
import { KORTING_SHOWROOM, KORTING_VERKOOPPUNT } from "@/lib/distributeur-prijzen";

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
  ],
});

export type PrijslijstTaal = "nl" | "de" | "en" | "es";

const eur = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v);
const vandaag = (taal: PrijslijstTaal) =>
  new Intl.DateTimeFormat(taal, { day: "numeric", month: "long", year: "numeric" }).format(new Date());

type Teksten = {
  headline: string;
  intro: string;
  docLabel: string;
  runningTitle: string;
  wallPanels: string;
  uitleg: { kop: string; regels: string[] };
  thSize: string;
  thAdvies: string;
  thVerkooppunt: string;
  thShowroom: string;
  exVat: string;
  inclVat: string;
  inStock: string;
  footerNote: string;
};

const L: Record<PrijslijstTaal, Teksten> = {
  nl: {
    headline: "Flexibel Stone",
    intro:
      "Prijzen voor verkooppunten: winkels en showrooms die Flexibel Stone doorverkopen. De adviesprijs ligt vast, dus je marge staat vast — je hoeft er niet over te onderhandelen.",
    docLabel: "Prijzen voor verkooppunten",
    runningTitle: "Prijzen verkooppunten",
    wallPanels: "Wandpanelen",
    uitleg: {
      kop: "Hoe deze lijst werkt",
      regels: [
        `Jouw inkoopprijs is ${KORTING_VERKOOPPUNT}% onder de adviesprijs. De adviesprijs is de vaste verkoopprijs die overal geldt, ook bij ons.`,
        `Materiaal voor je eigen showroom koopt je met ${KORTING_SHOWROOM}% korting — bedoeld om te tonen, niet om door te verkopen.`,
        "Alle bedragen ex. btw. Elke maat heeft zijn eigen prijs.",
      ],
    },
    thSize: "Maat",
    thAdvies: "Adviesprijs",
    thVerkooppunt: `Jouw prijs −${KORTING_VERKOOPPUNT}%`,
    thShowroom: `Showroom −${KORTING_SHOWROOM}%`,
    exVat: "ex btw",
    inclVat: "incl btw",
    inStock: "voorraad",
    footerNote:
      "Prijzen voor verkooppunten, alle bedragen ex. btw. De adviesprijs is de vaste consumentenprijs. Prijzen onder voorbehoud van wijzigingen.",
  },
  de: {
    headline: "Flexibel Stone",
    intro:
      "Preise für Verkaufsstellen: Geschäfte und Showrooms, die Flexibel Stone weiterverkaufen. Der empfohlene Preis steht fest, also steht auch Ihre Marge fest.",
    docLabel: "Preise für Verkaufsstellen",
    runningTitle: "Preise Verkaufsstellen",
    wallPanels: "Wandpaneele",
    uitleg: {
      kop: "So funktioniert diese Liste",
      regels: [
        `Ihr Einkaufspreis liegt ${KORTING_VERKOOPPUNT}% unter dem empfohlenen Endkundenpreis, der überall gilt — auch bei uns.`,
        `Material für Ihren eigenen Showroom kaufen Sie mit ${KORTING_SHOWROOM}% Rabatt — zum Zeigen, nicht zum Weiterverkauf.`,
        "Alle Beträge exkl. MwSt. Jede Größe hat ihren eigenen Preis.",
      ],
    },
    thSize: "Größe",
    thAdvies: "Empf. Preis",
    thVerkooppunt: `Ihr Preis −${KORTING_VERKOOPPUNT}%`,
    thShowroom: `Showroom −${KORTING_SHOWROOM}%`,
    exVat: "exkl. MwSt",
    inclVat: "inkl. MwSt",
    inStock: "Lager",
    footerNote:
      "Preise für Verkaufsstellen, alle Beträge exkl. MwSt. Der empfohlene Preis ist der feste Endkundenpreis. Preise freibleibend.",
  },
  en: {
    headline: "Flexibel Stone",
    intro:
      "Prices for points of sale: shops and showrooms that resell Flexibel Stone. The recommended price is fixed, so your margin is fixed too — nothing to negotiate.",
    docLabel: "Prices for points of sale",
    runningTitle: "Points of sale",
    wallPanels: "Wall panels",
    uitleg: {
      kop: "How this list works",
      regels: [
        `Your purchase price is ${KORTING_VERKOOPPUNT}% below the recommended price — the fixed consumer price that applies everywhere, including with us.`,
        `Material for your own showroom comes with ${KORTING_SHOWROOM}% off — meant to display, not to resell.`,
        "All amounts excl. VAT. Every size has its own price.",
      ],
    },
    thSize: "Size",
    thAdvies: "Recommended",
    thVerkooppunt: `Your price −${KORTING_VERKOOPPUNT}%`,
    thShowroom: `Showroom −${KORTING_SHOWROOM}%`,
    exVat: "excl. VAT",
    inclVat: "incl. VAT",
    inStock: "in stock",
    footerNote:
      "Prices for points of sale, all amounts excl. VAT. The recommended price is the fixed consumer price. Prices subject to change.",
  },
  es: {
    headline: "Flexibel Stone",
    intro:
      "Precios para puntos de venta: tiendas y showrooms que revenden Flexibel Stone. El precio recomendado es fijo, así que tu margen también lo es: no hay que negociar nada.",
    docLabel: "Precios para puntos de venta",
    runningTitle: "Puntos de venta",
    wallPanels: "Paneles de pared",
    uitleg: {
      kop: "Cómo funciona esta lista",
      regels: [
        `Tu precio de compra es un ${KORTING_VERKOOPPUNT}% por debajo del precio recomendado, que es el precio de venta fijo en todas partes, también en nuestra tienda.`,
        `El material para tu propio showroom lleva un ${KORTING_SHOWROOM}% de descuento: para mostrar, no para revender.`,
        "Todos los importes sin IVA. Cada medida tiene su propio precio.",
      ],
    },
    thSize: "Medida",
    thAdvies: "P. recomendado",
    thVerkooppunt: `Tu precio −${KORTING_VERKOOPPUNT}%`,
    thShowroom: `Showroom −${KORTING_SHOWROOM}%`,
    exVat: "sin IVA",
    inclVat: "con IVA",
    inStock: "en stock",
    footerNote:
      "Precios para puntos de venta, importes sin IVA. El precio recomendado es el precio de consumo fijo. Precios sujetos a cambios.",
  },
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
  pageHeaderRight: { fontFamily: "Sora", fontWeight: 500, fontSize: 7.5, letterSpacing: 2, textTransform: "uppercase", color: COMPANY.muted },

  uitleg: { backgroundColor: COMPANY.sand, borderRadius: 4, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 16 },
  uitlegKop: { fontFamily: "Sora", fontWeight: 600, fontSize: 8, color: COMPANY.brown, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
  uitlegRegel: { fontFamily: "Sora", fontWeight: 400, fontSize: 8, color: COMPANY.brown, lineHeight: 1.5 },

  sectionLabel: { fontFamily: "Sora", fontWeight: 500, fontSize: 8, color: COMPANY.terracotta, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 },
  sectionTitle: { fontFamily: "Sora", fontWeight: 700, fontSize: 17, color: COMPANY.brown, letterSpacing: -0.4, lineHeight: 1.1 },
  sectionRule: { height: 1, backgroundColor: COMPANY.brown, marginTop: 7, marginBottom: 10 },

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
  numKlein: { fontFamily: "Sora", fontWeight: 300, fontSize: 6.4, color: COMPANY.muted, marginTop: 1 },

  footer: { position: "absolute", left: 44, right: 44, bottom: 28, paddingTop: 10, borderTopWidth: 0.5, borderColor: COMPANY.sand, fontSize: 7, color: COMPANY.muted, textAlign: "center", lineHeight: 1.6, fontFamily: "Sora", fontWeight: 400 },
  footerStrong: { fontFamily: "Sora", fontWeight: 700, color: COMPANY.brown, letterSpacing: 1.5 },
  footerNote: { fontFamily: "Sora", fontWeight: 300, fontSize: 6.6, color: COMPANY.muted, marginTop: 3 },
  pageNum: { position: "absolute", bottom: 14, right: 44, fontSize: 7, color: COMPANY.muted, fontFamily: "Sora" },
});

function Bedrag({ waarde, onder, sterk }: { waarde: number | null; onder?: string; sterk?: boolean }) {
  return (
    <View style={s.colNumBox}>
      <Text style={sterk ? s.numStrong : s.numReg}>{eur(waarde)}</Text>
      {onder ? <Text style={s.numKlein}>{onder}</Text> : null}
    </View>
  );
}

function PaneelBlok({ item, t }: { item: DistributeurItem; t: Teksten }) {
  // Serie-naam vooraan de kleurnaam weglaten ("Italian Travertine - Yellow Wood" → "Yellow Wood").
  let naam = item.naam;
  const prefix = `${item.groep} - `;
  if (naam.startsWith(prefix)) naam = naam.slice(prefix.length);

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
          <Text style={s.prodName}>{naam}</Text>
          {item.sku && <Text style={s.prodSku}>{item.sku}</Text>}
        </View>
      </View>

      <View style={s.table}>
        <View style={s.th}>
          <Text style={s.thSize}>{t.thSize}</Text>
          <Text style={s.thNum}>{t.thAdvies}{"\n"}({t.inclVat})</Text>
          <Text style={s.thNum}>{t.thVerkooppunt}{"\n"}({t.exVat})</Text>
          <Text style={s.thNum}>{t.thShowroom}{"\n"}({t.exVat})</Text>
        </View>
        {item.maten.map((m, i) => (
          <View key={i} style={s.tr}>
            <View style={s.cDim}>
              <Text style={s.dimText}>{m.dim}</Text>
              {m.inStock && <Text style={s.stockTag}>{t.inStock}</Text>}
            </View>
            <Bedrag waarde={m.adviesIncl} onder={`${eur(m.adviesEx)} ${t.exVat}`} />
            <Bedrag waarde={m.verkooppunt} onder={m.areaM2 ? `${eur(m.verkooppunt / m.areaM2)}/m²` : undefined} sterk />
            <Bedrag waarde={m.showroom} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Prijslijst({
  items,
  ondertitel,
  taal,
}: {
  items: DistributeurItem[];
  ondertitel: string;
  taal: PrijslijstTaal;
}) {
  const t = L[taal];
  const groepen = new Map<string, DistributeurItem[]>();
  for (const it of items) {
    const key = it.groep || "Overige";
    if (!groepen.has(key)) groepen.set(key, []);
    groepen.get(key)!.push(it);
  }

  return (
    <Document>
      {/* -------- OMSLAG -------- */}
      <Page size="A4" style={s.cover}>
        <View style={s.coverInner}>
          <View>
            <PdfImage src={LOGO_CREAM} style={s.coverLogo} />
            <Text style={s.coverHeadline}>{t.headline}</Text>
            <View style={s.coverHeadlineMark} />
            <Text style={s.coverEyebrow}>{COMPANY.tagline.toUpperCase()}</Text>
            <Text style={s.coverIntro}>{t.intro}</Text>
            <Text style={s.coverDocLabel}>
              {t.docLabel} — {ondertitel}
            </Text>
          </View>
          <View>
            <Text style={s.coverMeta}>{vandaag(taal)}</Text>
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

      {/* -------- PRIJZEN (liggend) -------- */}
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.pageHeader} fixed>
          <PdfImage src={LOGO_DARK} style={s.pageHeaderLogo} />
          <Text style={s.pageHeaderRight}>
            {t.runningTitle} · {vandaag(taal)}
          </Text>
        </View>

        <View style={s.uitleg}>
          <Text style={s.uitlegKop}>{t.uitleg.kop}</Text>
          {t.uitleg.regels.map((regel, i) => (
            <Text key={i} style={s.uitlegRegel}>
              · {regel}
            </Text>
          ))}
        </View>

        {[...groepen.entries()].map(([groep, panelen], gi) => (
          <View key={groep} break={gi > 0}>
            <View wrap={false}>
              <Text style={s.sectionLabel}>{t.wallPanels}</Text>
              <Text style={s.sectionTitle}>{groep}</Text>
              <View style={s.sectionRule} />
            </View>
            {panelen.map((it, i) => (
              <PaneelBlok key={i} item={it} t={t} />
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

export async function renderDistributeurPrijslijst(args: {
  items: DistributeurItem[];
  ondertitel: string;
  taal?: PrijslijstTaal;
}): Promise<Buffer> {
  return renderToBuffer(
    <Prijslijst items={args.items} ondertitel={args.ondertitel} taal={args.taal ?? "nl"} />,
  );
}
