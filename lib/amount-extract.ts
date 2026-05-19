/**
 * Rules-based amount-extractie uit factuur-PDF's en Excels.
 * Geen AI nodig voor bekende leverancier-formats — pure regex + XLSX parsing.
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as XLSX from "xlsx";

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "email-attachments";

function supabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

interface ExtractCtx {
  filename: string;
  contentType: string;
  category: string;
  supplierTag: string | null;
}

/** Patroon-gebaseerde regex voor totaalbedragen per leverancier. */
const PDF_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  // Alianza: "Total EUR: 3.365,95 €"
  { name: "Alianza Total EUR", regex: /Total\s+EUR:?\s*([\d.,]+)\s*€/i },
  // Yohome CI: "TOTAL: $52,651.40" or "TOTAL: 52,651.40"
  { name: "Yohome TOTAL", regex: /^\s*TOTAL:?\s*[\$]?([\d.,]+)\s*$/im },
  // Allpack handling-CI: "Total Amount(USD)  10,394.12" of "TOTAL:  10394.12"
  { name: "Allpack handling", regex: /Total\s*Amount\s*\([A-Z]+\)\s*[\$]?([\d.,]+)/i },
  // Teresa: "Total Factura 735,03 EUR"
  { name: "Teresa Total Factura", regex: /Total\s*Factura\s*([\d.,]+)\s*EUR/i },
  // Oper-Traimer: "TOTAL (EUR)         2.723,14"
  { name: "Oper-Traimer TOTAL (EUR)", regex: /TOTAL\s*\(\s*EUR\s*\)\s+([\d.,]+)/i },
  // DUA: 'CUOTAS RESULTANTES ... A00 ... 894,17  B00 ... 11.292,05'
  // (gebruiken we niet voor invoice-totaal, IVA is recoverable)
  // Generic fallback: "Total: 1234.56" or "Grand Total: 1234,56 EUR"
  { name: "Generic Total", regex: /(?:Grand\s+)?Total[:\s]+(?:EUR\s*)?[\$€]?\s*([\d.,]+)\s*(?:EUR|€|USD|\$)?/i },
];

/** Parse Excel: zoek cellen met "TOTAL" en pak de waarde aan rechterkant. */
function extractFromExcel(buffer: Buffer): number | null {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!Array.isArray(r)) continue;
        // Search row for "TOTAL" cell, then check neighbors for number
        for (let c = 0; c < r.length; c++) {
          const val = String(r[c] ?? "").trim().toUpperCase();
          if (val === "TOTAL:" || val === "TOTAL" || val === "TOTAL FACTURA" || val === "TOTAL AMOUNT") {
            // Look at next cells in row
            for (let nc = c + 1; nc < r.length; nc++) {
              const next = r[nc];
              if (typeof next === "number" && next > 0) return next;
              if (typeof next === "string" && /^[\$€]?[\d.,]+$/.test(next.trim())) {
                const num = Number(next.replace(/[^\d.,-]/g, "").replace(",", "."));
                if (Number.isFinite(num) && num > 0) return num;
              }
            }
          }
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Parse PDF via pdftotext (system tool) + regex. */
function extractFromPdf(filePath: string): number | null {
  try {
    const text = execSync(`pdftotext -layout "${filePath}" -`, { encoding: "utf-8", timeout: 15000 });
    for (const { regex } of PDF_PATTERNS) {
      const match = text.match(regex);
      if (match?.[1]) {
        // Parse European format: "3.365,95" or US "3,365.95"
        let raw = match[1];
        if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(raw)) {
          // European: thousands . decimal ,
          raw = raw.replace(/\./g, "").replace(",", ".");
        } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(raw)) {
          // US: thousands , decimal .
          raw = raw.replace(/,/g, "");
        } else {
          // Single: convert , → .
          raw = raw.replace(",", ".");
        }
        const num = Number(raw);
        if (Number.isFinite(num) && num > 0) return num;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Extract bedrag uit één bijlage. Download tijdelijk, parse, cleanup. */
export async function extractAttachmentAmount(args: {
  storagePath: string;
  filename: string;
  contentType: string;
}): Promise<number | null> {
  const sb = supabase();
  const { data, error } = await sb.storage.from(BUCKET).download(args.storagePath);
  if (error || !data) return null;
  const buffer = Buffer.from(await data.arrayBuffer());

  // Excel
  if (
    args.contentType.includes("spreadsheet") ||
    args.contentType === "application/vnd.ms-excel" ||
    args.filename.endsWith(".xlsx") ||
    args.filename.endsWith(".xls")
  ) {
    return extractFromExcel(buffer);
  }

  // PDF — schrijf tijdelijk naar disk voor pdftotext
  if (args.contentType === "application/pdf" || args.filename.endsWith(".pdf")) {
    const tmp = path.join(os.tmpdir(), `att-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, buffer);
    try {
      return extractFromPdf(tmp);
    } finally {
      fs.unlinkSync(tmp);
    }
  }

  return null;
}
