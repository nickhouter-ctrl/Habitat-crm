/* Server-only: rendert een cijfer-/managementoverzicht naar een luxe, printbare
 * PDF via @react-pdf/renderer — in dezelfde Habitat One-huisstijl als de
 * offerte/factuur-PDF (Cormorant-serif, gouden accentlijnen, crème & terracotta).
 * Generiek opgezet (KPI's + tabellen), zodat zowel de Rapporten- als de
 * Producten-pagina 'm kan voeden. */
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

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
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
const CORMORANT_DIR = path.join(process.cwd(), "public", "fonts", "cormorant");
Font.register({
  family: "Cormorant",
  fonts: [
    { src: path.join(CORMORANT_DIR, "CormorantGaramond-Medium.ttf"), fontWeight: 500 },
    { src: path.join(CORMORANT_DIR, "CormorantGaramond-SemiBold.ttf"), fontWeight: 600 },
  ],
});

const LOGO_CREAM = path.join(process.cwd(), "public", "brand", "habitat-one-logo-cream.png");

export type ReportKpi = { label: string; value: string; hint?: string };
export type ReportColumn = { header: string; align?: "left" | "right"; flex?: number };
export type ReportTable = {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: string[][];
  /** Optionele klemtoon per rij (bv. terracotta-regel voor 'vervallen'/verlies). */
  emphasizeRow?: (rowIndex: number) => boolean;
  emptyText?: string;
};
export type ReportPdfInput = {
  title: string;
  subtitle?: string;
  generatedAt: Date;
  kpis: ReportKpi[];
  tables: ReportTable[];
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Sora",
    fontSize: 9,
    color: COMPANY.charcoal,
    paddingTop: 44,
    paddingBottom: 52,
    paddingHorizontal: 46,
    backgroundColor: "#ffffff",
  },
  /* Decoratieve gouden bovenrand */
  topBand: { position: "absolute", top: 0, left: 0, right: 0, height: 5, backgroundColor: COMPANY.terracotta },
  topBandGold: { position: "absolute", top: 5, left: 0, right: 0, height: 1, backgroundColor: COMPANY.gold },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  logo: { height: 30, objectFit: "contain" },
  tagline: { fontSize: 7.5, color: COMPANY.muted, marginTop: 5, letterSpacing: 1.4, textTransform: "uppercase" },
  headerRight: { alignItems: "flex-end" },
  headerKicker: { fontSize: 6.5, color: COMPANY.gold, textTransform: "uppercase", letterSpacing: 1.6 },
  headerDate: { fontSize: 9.5, color: COMPANY.brown, fontWeight: 600, marginTop: 2 },
  headerRule: { height: 0.8, backgroundColor: COMPANY.sand, marginTop: 10, marginBottom: 20 },

  /* Titelblok */
  title: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 30, color: COMPANY.brown, letterSpacing: 0.3 },
  titleAccent: { height: 2, width: 46, backgroundColor: COMPANY.gold, marginTop: 7, marginBottom: 7 },
  subtitle: { fontSize: 8.5, color: COMPANY.muted, marginBottom: 18, maxWidth: 420, lineHeight: 1.4 },

  /* KPI-tegels */
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginBottom: 4 },
  kpiCell: { width: "25%", padding: 5 },
  kpiBox: {
    backgroundColor: "#fbf8f3",
    borderWidth: 0.8,
    borderColor: COMPANY.sand,
    borderTopWidth: 2,
    borderTopColor: COMPANY.gold,
    paddingVertical: 9,
    paddingHorizontal: 10,
    height: 66,
  },
  kpiLabel: { fontSize: 6.5, color: COMPANY.muted, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 19, color: COMPANY.brown, marginTop: 5 },
  kpiHint: { fontSize: 6.5, color: COMPANY.muted, marginTop: 3 },

  /* Tabellen */
  tableBlock: { marginTop: 20 },
  tableTitle: { fontFamily: "Cormorant", fontWeight: 600, fontSize: 15, color: COMPANY.brown },
  tableTitleAccent: { height: 1.5, width: 28, backgroundColor: COMPANY.gold, marginTop: 4 },
  tableSubtitle: { fontSize: 7.5, color: COMPANY.muted, marginTop: 4, marginBottom: 7 },
  tHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COMPANY.brown,
    paddingBottom: 4,
    paddingHorizontal: 4,
  },
  tHeadCell: { fontSize: 7, fontWeight: 600, color: COMPANY.brown, textTransform: "uppercase", letterSpacing: 0.5 },
  tRow: {
    flexDirection: "row",
    paddingVertical: 4.5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ece5da",
  },
  tRowAlt: { backgroundColor: "#faf7f2" },
  tCell: { fontSize: 8.5, color: COMPANY.charcoal },
  tCellNum: { fontSize: 8.5, color: COMPANY.brown, fontWeight: 500 },
  tCellEmph: { fontSize: 8.5, color: COMPANY.terracotta, fontWeight: 600 },
  empty: { fontSize: 8.5, color: COMPANY.muted, paddingVertical: 8, paddingHorizontal: 4 },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 26,
    left: 46,
    right: 46,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: COMPANY.sand,
    paddingTop: 7,
  },
  footerText: { fontSize: 7, color: COMPANY.muted, letterSpacing: 0.2 },
});

function Table({ table }: { table: ReportTable }) {
  return (
    <View style={s.tableBlock} wrap={false}>
      <Text style={s.tableTitle}>{table.title}</Text>
      <View style={s.tableTitleAccent} />
      {table.subtitle ? <Text style={s.tableSubtitle}>{table.subtitle}</Text> : <View style={{ height: 5 }} />}
      <View style={s.tHead}>
        {table.columns.map((c, i) => (
          <Text key={i} style={[s.tHeadCell, { flex: c.flex ?? 1, textAlign: c.align ?? "left" }]}>
            {c.header}
          </Text>
        ))}
      </View>
      {table.rows.length === 0 ? (
        <Text style={s.empty}>{table.emptyText ?? "Geen gegevens."}</Text>
      ) : (
        table.rows.map((row, ri) => {
          const emph = table.emphasizeRow?.(ri) ?? false;
          return (
            <View key={ri} style={[s.tRow, ri % 2 === 1 ? s.tRowAlt : {}]}>
              {table.columns.map((c, ci) => {
                const right = (c.align ?? "left") === "right";
                const base = emph ? s.tCellEmph : right ? s.tCellNum : s.tCell;
                return (
                  <Text key={ci} style={[base, { flex: c.flex ?? 1, textAlign: c.align ?? "left" }]}>
                    {row[ci] ?? ""}
                  </Text>
                );
              })}
            </View>
          );
        })
      )}
    </View>
  );
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const dateStr = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(input.generatedAt);

  const doc = (
    <Document title={input.title} author={COMPANY.legalName}>
      <Page size="A4" style={s.page}>
        <View style={s.topBand} fixed />
        <View style={s.topBandGold} fixed />

        <View style={s.header} fixed>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_CREAM} style={s.logo} />
            <Text style={s.tagline}>{COMPANY.tagline}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerKicker}>Overzicht</Text>
            <Text style={s.headerDate}>{dateStr}</Text>
          </View>
        </View>
        <View style={s.headerRule} fixed />

        <Text style={s.title}>{input.title}</Text>
        <View style={s.titleAccent} />
        {input.subtitle ? <Text style={s.subtitle}>{input.subtitle}</Text> : <View style={{ marginBottom: 12 }} />}

        {input.kpis.length > 0 && (
          <View style={s.kpiGrid}>
            {input.kpis.map((k, i) => (
              <View key={i} style={s.kpiCell}>
                <View style={s.kpiBox}>
                  <Text style={s.kpiLabel}>{k.label}</Text>
                  <Text style={s.kpiValue}>{k.value}</Text>
                  {k.hint ? <Text style={s.kpiHint}>{k.hint}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {input.tables.map((t, i) => (
          <Table key={i} table={t} />
        ))}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            {COMPANY.legalName} · {COMPANY.vatNumber} · {COMPANY.website}
          </Text>
          <Text
            style={s.footerText}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );

  return (await renderToBuffer(doc)) as Buffer;
}
