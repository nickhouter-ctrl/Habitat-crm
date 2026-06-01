/* Server-only: zet een Excel-factuur (.xlsx/.xls) om in een nette, leesbare PDF.
 *
 * Het probleem dat dit oplost: Excel-facturen van leveranciers zijn vaak te
 * breed om op een PDF te passen — tekst wordt afgesneden of de letters worden
 * onleesbaar klein. Deze renderer:
 *   - kiest automatisch liggend (landscape),
 *   - schaalt de kolommen om op de paginabreedte te passen,
 *   - breekt celtekst netjes af (niets valt weg),
 *   - splitst extreem brede tabellen over meerdere pagina's i.p.v. mini-letters.
 *
 * Parsen gaat via SheetJS (leest zowel .xlsx als legacy .xls). De opmaak
 * (kleuren/logo's) wordt niet 1-op-1 gekloond — het doel is leesbaarheid.
 * Let op: niet-Latijnse tekens (bv. Chinees) worden niet gerenderd.
 */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import * as XLSX from "xlsx";

import { uploadPurchaseOrderBytes } from "@/lib/storage";

// A4 liggend, in punten.
const PAGE_W = 842;
const MARGIN = 24;
const AVAIL_W = PAGE_W - MARGIN * 2; // ~794
const MIN_COL = 38;
const MAX_COL = 150;
const MAX_ROWS_PER_SHEET = 600;
const MAX_CELL_CHARS = 600;

const styles = StyleSheet.create({
  page: { paddingVertical: MARGIN, paddingHorizontal: MARGIN, fontSize: 8, fontFamily: "Helvetica" },
  title: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 8, color: "#6b6b6b", marginBottom: 8 },
  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: "#d0cdc7" },
  row: { flexDirection: "row" },
  rowAlt: { flexDirection: "row", backgroundColor: "#faf8f5" },
  headerRow: { flexDirection: "row", backgroundColor: "#efece6" },
  cell: {
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#d0cdc7",
    paddingVertical: 2,
    paddingHorizontal: 3,
  },
  cellText: { fontSize: 7.5, lineHeight: 1.15 },
  headerText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  note: { fontSize: 7, color: "#9a9a9a", marginTop: 6 },
});

type Grid = { rows: string[][]; widths: number[]; sheetName: string; truncated: boolean };

/** Lees een werkblad uit tot een opgeschoond raster + kolombreedtes (in pt). */
function sheetToGrid(ws: XLSX.WorkSheet, sheetName: string): Grid | null {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false, blankrows: false });
  if (!raw.length) return null;

  // Aantal kolommen = breedste rij.
  let colCount = 0;
  for (const r of raw) colCount = Math.max(colCount, r.length);
  if (colCount === 0) return null;

  // Normaliseer cellen naar strings; sla volledig lege rijen over.
  const rows: string[][] = [];
  let truncated = false;
  for (const r of raw) {
    if (rows.length >= MAX_ROWS_PER_SHEET) {
      truncated = true;
      break;
    }
    const cells: string[] = [];
    let hasContent = false;
    for (let c = 0; c < colCount; c++) {
      let s = r[c] == null ? "" : String(r[c]);
      s = s.replace(/\s+/g, " ").trim();
      if (s.length > MAX_CELL_CHARS) s = s.slice(0, MAX_CELL_CHARS) + "…";
      if (s) hasContent = true;
      cells.push(s);
    }
    if (hasContent) rows.push(cells);
  }
  if (!rows.length) return null;

  // Verwijder volledig lege kolommen (rechts) zodat de tabel niet onnodig breed is.
  let lastUsed = 0;
  for (const row of rows) for (let c = 0; c < row.length; c++) if (row[c]) lastUsed = Math.max(lastUsed, c);
  colCount = lastUsed + 1;
  for (let i = 0; i < rows.length; i++) rows[i] = rows[i].slice(0, colCount);

  // Kolombreedtes uit het bestand (chars/px) → punten, geclampt.
  const cols = (ws["!cols"] ?? []) as Array<{ wch?: number; wpx?: number }>;
  const widths: number[] = [];
  for (let c = 0; c < colCount; c++) {
    const meta = cols[c];
    let pt = 60;
    if (meta?.wpx) pt = meta.wpx * 0.75;
    else if (meta?.wch) pt = meta.wch * 5.5;
    widths.push(Math.min(MAX_COL, Math.max(MIN_COL, Math.round(pt))));
  }
  return { rows, widths, sheetName, truncated };
}

/** Verdeel kolommen in groepen die elk op de paginabreedte passen. */
function columnGroups(widths: number[]): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  for (let i = 0; i < widths.length; i++) {
    const w = Math.min(widths[i], AVAIL_W);
    if (cur.length && sum + w > AVAIL_W) {
      groups.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(i);
    sum += w;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function GridTable({ grid }: { grid: Grid }) {
  const groups = columnGroups(grid.widths);

  return (
    <>
      {groups.map((group, gi) => {
        // Eerste kolom (vaak omschrijving) als context herhalen bij vervolg-groepen.
        const cols = gi > 0 && group[0] !== 0 ? [0, ...group] : group;
        const rawWidths = cols.map((c) => grid.widths[c]);
        const sum = rawWidths.reduce((a, b) => a + b, 0);
        const factor = sum > 0 ? AVAIL_W / sum : 1; // vul de breedte exact
        const widths = rawWidths.map((w) => w * factor);

        return (
          <View key={gi} style={styles.table} break={gi > 0}>
            {grid.rows.map((row, ri) => {
              const isHeader = ri === 0;
              const rowStyle = isHeader ? styles.headerRow : ri % 2 === 0 ? styles.rowAlt : styles.row;
              return (
                <View key={ri} style={rowStyle} wrap={false}>
                  {cols.map((c, ci) => (
                    <View key={ci} style={[styles.cell, { width: widths[ci] }]}>
                      <Text style={isHeader ? styles.headerText : styles.cellText}>{row[c] ?? ""}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}

function ExcelPdf({ grids, sourceName }: { grids: Grid[]; sourceName: string }) {
  return (
    <Document title={sourceName}>
      {grids.map((grid, i) => (
        <Page key={i} size="A4" orientation="landscape" style={styles.page} wrap>
          <Text style={styles.title}>{sourceName}</Text>
          <Text style={styles.subtitle}>
            {grids.length > 1 ? `Tabblad: ${grid.sheetName}` : "Geautomatiseerd omgezet uit Excel"}
          </Text>
          <GridTable grid={grid} />
          {grid.truncated && (
            <Text style={styles.note}>
              (Alleen de eerste {MAX_ROWS_PER_SHEET} rijen getoond — origineel Excel-bestand blijft bewaard.)
            </Text>
          )}
        </Page>
      ))}
    </Document>
  );
}

/**
 * Render een Excel-buffer naar een leesbare PDF-buffer.
 * Retourneert null als er geen bruikbare inhoud is.
 */
export async function renderExcelToPdf(excel: Buffer | Uint8Array, sourceName: string): Promise<Buffer | null> {
  const wb = XLSX.read(excel, { type: "buffer", cellDates: true });
  const grids: Grid[] = [];
  for (const name of wb.SheetNames) {
    const grid = sheetToGrid(wb.Sheets[name], name);
    if (grid) grids.push(grid);
  }
  if (!grids.length) return null;
  return renderToBuffer(<ExcelPdf grids={grids} sourceName={sourceName} />);
}

const EXCEL_EXT = /\.(xlsx|xls|xlsm)$/i;
const EXCEL_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
]);

/** Is deze bijlage een Excel-bestand? */
export function isExcelAttachment(filename: string, contentType?: string | null): boolean {
  return EXCEL_EXT.test(filename) || (!!contentType && EXCEL_MIME.has(contentType));
}

/** Bestandsnaam voor de gegenereerde PDF (zelfde basis, .pdf). */
export function pdfNameFor(excelName: string): string {
  return excelName.replace(EXCEL_EXT, "") + ".pdf";
}

/**
 * Maak van een Excel-buffer een PDF en upload die naar de PO-bucket.
 * Retourneert de attachment-metadata (voor purchase_orders.attachments) of null.
 */
export async function buildInvoicePdfAttachment(
  excel: Buffer | Uint8Array,
  excelName: string,
): Promise<{ name: string; path: string; size: number; uploadedAt: string } | null> {
  const pdf = await renderExcelToPdf(excel, excelName);
  if (!pdf) return null;
  const meta = await uploadPurchaseOrderBytes(pdfNameFor(excelName), pdf, "application/pdf");
  return meta ? { ...meta, uploadedAt: new Date().toISOString() } : null;
}
