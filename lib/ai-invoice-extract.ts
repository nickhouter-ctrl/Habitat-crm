/**
 * AI-uitlezing van een factuur-bijlage (PDF of Excel) met de Anthropic-API.
 * Wordt als FALLBACK gebruikt wanneer de regel-gebaseerde herkenning de
 * leverancier of het bedrag niet vindt — bv. bij facturen die Creadores
 * (= wijzelf) alleen dóórstuurt: de échte leverancier staat dan in de PDF,
 * niet in de mail.
 *
 * Vereist `ANTHROPIC_API_KEY`. Zonder key (of bij elke fout) → null, en valt
 * de mail terug op handmatige review.
 *
 * Kosten: ~1-3 cent per factuur. Draait alleen voor wat de regels missen.
 */
import * as XLSX from "xlsx";

import { downloadMailAttachmentBuffer } from "@/lib/storage";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export type AiInvoiceFields = {
  /** De partij die de factuur HEEFT UITGESCHREVEN (de verkoper/leverancier),
   *  NIET de ontvanger (Habitat / Creadores). */
  supplier: string | null;
  /** Eindtotaal incl. BTW in de valuta van de factuur. */
  total: number | null;
  currency: string | null;
  invoiceNumber: string | null;
  /** YYYY-MM-DD */
  invoiceDate: string | null;
};

const PROMPT = `Je leest één inkoopfactuur (van een leverancier aan ons bedrijf).

BELANGRIJK over de leverancier:
- De ONTVANGER/klant is altijd ons: "Habitat One", "Habitat one & one SL" of
  "Creadores Sorprendentes" (dat zijn wíj; Creadores stuurt facturen alleen door).
  Geef die NOOIT terug als supplier.
- De "supplier" is de partij die de factuur heeft UITGESCHREVEN (de verkoper /
  dienstverlener / het bedrijf bovenaan met zijn eigen NIF/CIF, dat geld van ons
  ontvangt). Gebruik de duidelijke handelsnaam, kort.

Geef ALLEEN een JSON-object terug — geen markdown, geen uitleg — met exact deze keys:
- "supplier": string | null — naam van de leverancier/verkoper (niet de klant)
- "total": number | null — het EINDTOTAAL inclusief BTW dat betaald moet worden
- "currency": string | null — 3-letter ISO-code ("EUR", "USD", …)
- "invoiceNumber": string | null — het factuurnummer
- "invoiceDate": string | null — factuurdatum als YYYY-MM-DD

Getallen zijn pure JSON-nummers (geen valutateken, geen duizendtal-scheiding).
Als iets onbekend is: null.`;

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

export function aiInvoiceConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Bouw de message-content: PDF als document, Excel als platte tekst. */
function buildContent(buffer: Buffer, filename: string, contentType: string): unknown[] | null {
  const isPdf = contentType === "application/pdf" || /\.pdf$/i.test(filename);
  const isExcel =
    contentType.includes("spreadsheet") ||
    contentType === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(filename);

  if (isPdf) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      },
      { type: "text", text: PROMPT },
    ];
  }
  if (isExcel) {
    try {
      const wb = XLSX.read(buffer, { type: "buffer" });
      const text = wb.SheetNames.map(
        (n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`,
      ).join("\n\n").slice(0, 60000);
      return [{ type: "text", text: `${PROMPT}\n\n--- FACTUUR (Excel als tekst) ---\n${text}` }];
    } catch {
      return null;
    }
  }
  return null;
}

export async function extractInvoiceFieldsWithAI(args: {
  storagePath: string;
  filename: string;
  contentType: string;
}): Promise<AiInvoiceFields | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const buffer = await downloadMailAttachmentBuffer(args.storagePath);
  if (!buffer) return null;

  const content = buildContent(buffer, args.filename, args.contentType);
  if (!content) return null;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        temperature: 0,
        messages: [{ role: "user", content }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("AI-invoice extract faalde:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;

    const raw = JSON.parse(stripFences(text)) as Record<string, unknown>;
    const supplier = str(raw.supplier);
    // Veiligheid: nooit onszelf als leverancier teruggeven.
    if (supplier && /habitat\s*one|creadores|sorprendentes/i.test(supplier)) {
      return {
        supplier: null,
        total: num(raw.total),
        currency: str(raw.currency)?.toUpperCase().slice(0, 3) ?? null,
        invoiceNumber: str(raw.invoiceNumber),
        invoiceDate: str(raw.invoiceDate)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
      };
    }
    return {
      supplier,
      total: num(raw.total),
      currency: str(raw.currency)?.toUpperCase().slice(0, 3) ?? null,
      invoiceNumber: str(raw.invoiceNumber),
      invoiceDate: str(raw.invoiceDate)?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
    };
  } catch (err) {
    console.warn("AI-invoice extract error:", err);
    return null;
  }
}
