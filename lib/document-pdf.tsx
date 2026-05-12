/* Server-only: renders a CRM document (offerte / factuur) to a PDF via @react-pdf/renderer. */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { COMPANY } from "@/lib/company";
import type { DocumentLineItem } from "@/lib/db/schema";
import { lineNet } from "@/lib/documents";
import { labelForCategory } from "@/lib/products";

const eur = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(
    Number(v) || 0,
  );
const fdate = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(d);
};

const KIND_LABEL: Record<string, string> = {
  estimate: "OFFERTE",
  proforma: "PRO-FORMA",
  invoice: "FACTUUR",
  creditnote: "CREDITNOTA",
  salesreceipt: "BON",
  deliverynote: "PAKBON",
};

const s = StyleSheet.create({
  page: { paddingHorizontal: 44, paddingTop: 44, paddingBottom: 64, fontSize: 9, fontFamily: "Helvetica", color: "#1c1c1a" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 },
  brand1: { fontFamily: "Times-Bold", fontSize: 22, letterSpacing: 4, color: COMPANY.brown },
  brand2: { fontFamily: "Times-Bold", fontSize: 22, letterSpacing: 4, color: COMPANY.brown, marginTop: -3 },
  tagline: { fontSize: 8, color: "#999", marginTop: 4 },
  docTitle: { fontFamily: "Helvetica-Bold", fontSize: 16, color: COMPANY.brown, textAlign: "right" },
  meta: { fontSize: 8.5, color: "#666", textAlign: "right", marginTop: 2 },
  metaStrong: { color: "#1c1c1a", fontFamily: "Helvetica-Bold" },
  parties: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18, gap: 24 },
  partyLabel: { fontSize: 7, color: "#999", letterSpacing: 1, marginBottom: 3 },
  muted: { color: "#666" },
  docSubject: { marginBottom: 10, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: COMPANY.brown },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: COMPANY.brown, paddingBottom: 4 },
  thText: { fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 0.5, color: "#666" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e3de", paddingVertical: 5 },
  cDesc: { flex: 4, paddingRight: 6 },
  cCat: { flex: 1.5, color: "#888", paddingRight: 4 },
  cNum: { flex: 1, textAlign: "right" },
  cVat: { flex: 0.8, textAlign: "right" },
  cAmt: { flex: 1.3, textAlign: "right" },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemDesc: { fontSize: 7.5, color: "#999", marginTop: 1 },
  totals: { marginTop: 14, alignSelf: "flex-end", width: 190 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalGrand: { borderTopWidth: 1, borderColor: COMPANY.brown, marginTop: 4, paddingTop: 5, fontFamily: "Helvetica-Bold", fontSize: 11.5 },
  notes: { marginTop: 20, paddingTop: 8, borderTopWidth: 0.5, borderColor: "#e5e3de", fontSize: 8.5, color: "#555", lineHeight: 1.5 },
  footer: { position: "absolute", left: 44, right: 44, bottom: 30, borderTopWidth: 0.5, borderColor: "#ddd", paddingTop: 8, fontSize: 7, color: "#999", textAlign: "center", lineHeight: 1.6 },
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
};

function DocumentPdf({ doc }: { doc: PdfDoc }) {
  const items = doc.items ?? [];
  const isDelivery = doc.kind === "deliverynote";
  const footerLine =
    `${COMPANY.legalName}${COMPANY.vatNumber ? ` · NIF ${COMPANY.vatNumber}` : ""} · ${COMPANY.address}\n` +
    `${COMPANY.email}${COMPANY.phone ? ` · ${COMPANY.phone}` : ""} · ${COMPANY.website}${COMPANY.iban ? ` · IBAN ${COMPANY.iban}` : ""}`;
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
            <Text style={s.docTitle}>
              {KIND_LABEL[doc.kind] ?? "DOCUMENT"} {doc.docNumber ?? ""}
            </Text>
            <Text style={s.meta}>
              Datum: <Text style={s.metaStrong}>{fdate(doc.issueDate)}</Text>
            </Text>
            {doc.dueDate && !isDelivery ? (
              <Text style={s.meta}>
                {doc.kind === "invoice" ? "Vervaldatum" : "Geldig t/m"}:{" "}
                <Text style={s.metaStrong}>{fdate(doc.dueDate)}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.parties}>
          <View style={{ flex: 1 }}>
            <Text style={s.partyLabel}>VAN</Text>
            <Text>{COMPANY.legalName}</Text>
            <Text style={s.muted}>{COMPANY.address}</Text>
            {COMPANY.vatNumber ? <Text style={s.muted}>NIF: {COMPANY.vatNumber}</Text> : null}
            <Text style={s.muted}>
              {COMPANY.email}
              {COMPANY.phone ? ` · ${COMPANY.phone}` : ""}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={s.partyLabel}>VOOR</Text>
            <Text>{doc.contactName ?? "—"}</Text>
            {doc.contactAddress ? (
              <Text style={[s.muted, { textAlign: "right" }]}>{doc.contactAddress}</Text>
            ) : null}
          </View>
        </View>

        {doc.title ? <Text style={s.docSubject}>{doc.title}</Text> : null}

        <View style={s.th}>
          <Text style={[s.thText, s.cDesc]}>OMSCHRIJVING</Text>
          <Text style={[s.thText, s.cCat]}>CATEGORIE</Text>
          <Text style={[s.thText, isDelivery ? s.cAmt : s.cNum]}>AANTAL</Text>
          {!isDelivery && (
            <>
              <Text style={[s.thText, s.cNum]}>PRIJS</Text>
              <Text style={[s.thText, s.cVat]}>BTW</Text>
              <Text style={[s.thText, s.cAmt]}>NETTO</Text>
            </>
          )}
        </View>
        {items.length === 0 ? (
          <Text style={[s.tr, s.muted]}>Geen regels.</Text>
        ) : (
          items.map((it, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <View style={s.cDesc}>
                <Text style={s.itemName}>{it.name}</Text>
                {it.description ? <Text style={s.itemDesc}>{it.description}</Text> : null}
                {!isDelivery && it.discount ? (
                  <Text style={s.itemDesc}>Korting {it.discount}%</Text>
                ) : null}
              </View>
              <Text style={s.cCat}>{labelForCategory(it.category)}</Text>
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

        {!isDelivery && (
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={s.muted}>Subtotaal</Text>
              <Text>{eur(doc.subtotalEur)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.muted}>BTW (IVA)</Text>
              <Text>{eur(doc.taxEur)}</Text>
            </View>
            <View style={[s.totalRow, s.totalGrand]}>
              <Text>Totaal</Text>
              <Text>{eur(doc.totalEur)}</Text>
            </View>
          </View>
        )}

        {isDelivery && (
          <View style={{ marginTop: 28, flexDirection: "row", gap: 40 }}>
            <View style={{ flex: 1, borderTopWidth: 0.5, borderColor: "#999", paddingTop: 4 }}>
              <Text style={s.muted}>Geleverd door (handtekening)</Text>
            </View>
            <View style={{ flex: 1, borderTopWidth: 0.5, borderColor: "#999", paddingTop: 4 }}>
              <Text style={s.muted}>Ontvangen door (handtekening)</Text>
            </View>
          </View>
        )}

        {doc.notes ? <Text style={s.notes}>{doc.notes}</Text> : null}

        <Text style={s.footer} fixed>
          {footerLine}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(doc: PdfDoc): Promise<Buffer> {
  return renderToBuffer(<DocumentPdf doc={doc} />);
}
