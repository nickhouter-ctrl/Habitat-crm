/* Server-only: rendert een prijslijst als PDF in de Habitat-huisstijl. */
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

const eur = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(v) || 0);

const today = () =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

const s = StyleSheet.create({
  page: { paddingHorizontal: 36, paddingTop: 36, paddingBottom: 56, fontSize: 8.5, fontFamily: "Helvetica", color: "#1c1c1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  brand1: { fontFamily: "Times-Bold", fontSize: 20, letterSpacing: 4, color: COMPANY.brown },
  brand2: { fontFamily: "Times-Bold", fontSize: 20, letterSpacing: 4, color: COMPANY.brown, marginTop: -3 },
  tagline: { fontSize: 7.5, color: "#999", marginTop: 4 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, color: COMPANY.brown, textAlign: "right" },
  meta: { fontSize: 8, color: "#666", textAlign: "right", marginTop: 2 },
  metaStrong: { color: "#1c1c1a", fontFamily: "Helvetica-Bold" },
  intro: { marginBottom: 12, color: "#555", lineHeight: 1.5 },
  group: { fontFamily: "Helvetica-Bold", fontSize: 11, color: COMPANY.brown, marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: COMPANY.brown, paddingBottom: 3, marginTop: 1 },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 6.8, letterSpacing: 0.5, color: "#666", textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#eee", paddingVertical: 4, alignItems: "center" },
  cPhoto: { width: 40, height: 40, marginRight: 6 },
  cName: { flex: 3.4, paddingRight: 6 },
  cDim: { flex: 1.6, color: "#666" },
  cSku: { flex: 1.1, color: "#888" },
  cPriceEx: { flex: 1.2, textAlign: "right" },
  cVat: { flex: 0.7, textAlign: "right", color: "#888" },
  cPriceIn: { flex: 1.2, textAlign: "right", fontFamily: "Helvetica-Bold" },
  itemName: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  itemDesc: { fontSize: 7, color: "#888", marginTop: 1 },
  photoBox: { width: 40, height: 40, borderRadius: 4, marginRight: 6, backgroundColor: "#f3f1ec", justifyContent: "center", alignItems: "center", overflow: "hidden" },
  photoEmpty: { fontSize: 7, color: "#bbb" },
  footer: { position: "absolute", left: 36, right: 36, bottom: 24, borderTopWidth: 0.5, borderColor: "#ddd", paddingTop: 6, fontSize: 7, color: "#999", textAlign: "center", lineHeight: 1.6 },
  pageNum: { position: "absolute", right: 36, bottom: 14, fontSize: 7, color: "#999" },
});

export interface PricelistItem {
  name: string;
  sku: string | null;
  description: string | null;
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
  return oneLine.length > 90 ? oneLine.slice(0, 87) + "…" : oneLine;
}

function incl(price: number, vatPct: number): number {
  return Math.round(price * (1 + vatPct / 100) * 100) / 100;
}

function PricelistPdf({
  items,
  title,
  subtitle,
}: {
  items: PricelistItem[];
  title: string;
  subtitle: string | null;
}) {
  // Group by 'group' field, behoud volgorde van eerste verschijning.
  const groups = new Map<string, PricelistItem[]>();
  for (const it of items) {
    const key = it.group || "Overige";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const footerLine =
    `${COMPANY.legalName}${COMPANY.vatNumber ? ` · NIF ${COMPANY.vatNumber}` : ""} · ${COMPANY.address}\n` +
    `${COMPANY.email}${COMPANY.phone ? ` · ${COMPANY.phone}` : ""} · ${COMPANY.website}`;

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.brand1}>{COMPANY.wordmark1}</Text>
            <Text style={s.brand2}>{COMPANY.wordmark2}</Text>
            <Text style={s.tagline}>{COMPANY.tagline}</Text>
          </View>
          <View>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={s.meta}>
              Datum: <Text style={s.metaStrong}>{today()}</Text>
            </Text>
            <Text style={s.meta}>
              Aantal artikelen: <Text style={s.metaStrong}>{items.length}</Text>
            </Text>
          </View>
        </View>
        {subtitle && <Text style={s.intro}>{subtitle}</Text>}

        {[...groups.entries()].map(([groupName, rows]) => (
          <View key={groupName} wrap>
            <Text style={s.group}>{groupName}</Text>
            <View style={s.th} wrap={false}>
              <View style={s.cPhoto} />
              <Text style={[s.thText, s.cName]}>Product</Text>
              <Text style={[s.thText, s.cDim]}>Afmetingen</Text>
              <Text style={[s.thText, s.cSku]}>SKU</Text>
              <Text style={[s.thText, s.cPriceEx]}>Ex BTW</Text>
              <Text style={[s.thText, s.cVat]}>BTW</Text>
              <Text style={[s.thText, s.cPriceIn]}>Incl BTW</Text>
            </View>
            {rows.map((it, i) => {
              const dim = formatDimensions(it);
              const desc = shortDesc(it.description);
              const ex = Number(it.priceEur ?? 0);
              const inc = ex > 0 ? incl(ex, it.vatRate) : 0;
              return (
                <View key={i} style={s.tr} wrap={false}>
                  <View style={s.photoBox}>
                    {it.imageUrl ? (
                      <PdfImage src={it.imageUrl} style={{ width: 40, height: 40, objectFit: "cover" }} />
                    ) : (
                      <Text style={s.photoEmpty}>geen{"\n"}foto</Text>
                    )}
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

        <Text style={s.footer} fixed>
          {footerLine}
        </Text>
        <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function renderPricelistPdf(args: {
  items: PricelistItem[];
  title: string;
  subtitle: string | null;
}): Promise<Buffer> {
  return renderToBuffer(<PricelistPdf {...args} />);
}
