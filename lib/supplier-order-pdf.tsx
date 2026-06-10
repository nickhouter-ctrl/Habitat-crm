/* Server-only: rendert een bestelbon (purchase request) naar PDF via @react-pdf/renderer. */
import path from "node:path";

import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { COMPANY } from "@/lib/company";

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
Font.register({
  family: "Sora",
  fonts: [
    { src: path.join(FONT_DIR, "Sora-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "Sora-Medium.ttf"), fontWeight: 500 },
    { src: path.join(FONT_DIR, "Sora-SemiBold.ttf"), fontWeight: 600 },
    { src: path.join(FONT_DIR, "Sora-Bold.ttf"), fontWeight: 700 },
  ],
});

const ACCENT = "#b15a3c"; // terracotta
const INK = "#2b2320";
const MUTED = "#7a7068";

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Sora", fontSize: 9, color: INK },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmark: { fontSize: 16, fontWeight: 700, letterSpacing: 3 },
  wordmark2: { color: ACCENT },
  small: { fontSize: 8, color: MUTED, lineHeight: 1.4 },
  h1: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  block: { marginTop: 18 },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: INK,
    paddingBottom: 4,
    marginTop: 14,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e4ded8",
    paddingVertical: 5,
  },
  cSku: { width: "18%", fontWeight: 600 },
  cDesc: { width: "57%", paddingRight: 6 },
  cQty: { width: "25%", textAlign: "right" },
  thText: { fontSize: 7.5, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 },
  notes: { marginTop: 20, fontSize: 8, color: MUTED, lineHeight: 1.5 },
  footer: { position: "absolute", bottom: 28, left: 40, right: 40, fontSize: 7, color: MUTED, textAlign: "center" },
});

export type SupplierOrderPdfData = {
  orderNumber: string;
  dateLabel: string;
  supplierName: string;
  supplierEmail?: string | null;
  customerRef?: string | null;
  notes?: string | null;
  items: Array<{
    sku: string;
    description: string;
    size?: string | null;
    qty: string;
    unit: string;
  }>;
};

const UNIT_LABEL: Record<string, string> = { stuk: "st", doos: "doos", m2: "m²" };

function SupplierOrderDoc({ data }: { data: SupplierOrderPdfData }) {
  return (
    <Document title={`Bestelbon ${data.orderNumber}`}>
      <Page size="A4" style={s.page}>
        <View style={s.rowBetween}>
          <View>
            <Text style={s.wordmark}>
              {COMPANY.wordmark1} <Text style={s.wordmark2}>{COMPANY.wordmark2}</Text>
            </Text>
            <Text style={[s.small, { marginTop: 6 }]}>
              {COMPANY.address}
              {"\n"}
              {COMPANY.email} · {COMPANY.phone}
              {"\n"}
              {COMPANY.vatNumber}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>Bestelbon</Text>
            <Text style={s.small}>Nr. {data.orderNumber}</Text>
            <Text style={s.small}>{data.dateLabel}</Text>
          </View>
        </View>

        <View style={[s.rowBetween, s.block]}>
          <View style={{ width: "60%" }}>
            <Text style={s.label}>Leverancier</Text>
            <Text style={{ fontSize: 11, fontWeight: 600 }}>{data.supplierName}</Text>
            {data.supplierEmail ? <Text style={s.small}>{data.supplierEmail}</Text> : null}
          </View>
          {data.customerRef ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.label}>Referentie / klant</Text>
              <Text>{data.customerRef}</Text>
            </View>
          ) : null}
        </View>

        {/* tabel */}
        <View style={s.th}>
          <Text style={[s.cSku, s.thText]}>SKU</Text>
          <Text style={[s.cDesc, s.thText]}>Omschrijving</Text>
          <Text style={[s.cQty, s.thText]}>Aantal</Text>
        </View>
        {data.items.map((it, i) => (
          <View style={s.tr} key={i} wrap={false}>
            <Text style={s.cSku}>{it.sku}</Text>
            <Text style={s.cDesc}>
              {it.description}
              {it.size ? `  ·  ${it.size}` : ""}
            </Text>
            <Text style={s.cQty}>
              {it.qty} {UNIT_LABEL[it.unit] ?? it.unit}
            </Text>
          </View>
        ))}

        {data.notes ? <Text style={s.notes}>{data.notes}</Text> : null}

        <Text style={s.footer}>
          {COMPANY.name} · {COMPANY.email} · {COMPANY.vatNumber}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderSupplierOrderPdf(data: SupplierOrderPdfData): Promise<Buffer> {
  return renderToBuffer(<SupplierOrderDoc data={data} />);
}
