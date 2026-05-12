/**
 * Extract a structured purchase order from an uploaded supplier proforma-invoice
 * PDF, using the Anthropic API (Claude reads the PDF directly).
 *
 * Needs `ANTHROPIC_API_KEY`. Without it (or on any failure) we return `null` —
 * the file still gets attached, the user just fills the order in by hand.
 */
export type ParsedPurchaseOrderItem = {
  name: string;
  sku?: string;
  units: number;
  unitPrice: number;
  note?: string;
};

export type ParsedPurchaseOrder = {
  supplier?: string;
  reference?: string;
  orderDate?: string; // YYYY-MM-DD
  expectedDate?: string; // YYYY-MM-DD
  currency?: string;
  items: ParsedPurchaseOrderItem[];
};

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const PROMPT = `You are extracting structured data from a supplier's proforma invoice / purchase order (often from a Chinese manufacturer such as KingKonree or a "Magic Stone" supplier).

Return ONLY a JSON object — no markdown, no commentary — with exactly these keys:
- "supplier": string — the seller / manufacturer company name
- "reference": string | null — the invoice / PI number
- "orderDate": string | null — the document date as YYYY-MM-DD
- "expectedDate": string | null — when the goods are expected ready/shipped (production lead time / "valid until" is NOT this; use the production-ready date if mentioned, else null), YYYY-MM-DD
- "currency": string — 3-letter ISO code (e.g. "USD", "EUR")
- "items": array of objects, each:
   - "name": string — the product item name/description (concise)
   - "sku": string | null — the item code / model number
   - "units": number — quantity ordered (in pieces)
   - "unitPrice": number — price per single piece in the document's currency (NOT the line total). If only a line total and quantity are given, divide.
   - "note": string | null — short extra info (colour, dimensions, "matches model X", etc.)

Include discount lines (e.g. "special discount") as an item with a negative unitPrice and units 1.
If a value is unknown, use null. Numbers must be plain JSON numbers (no currency symbols, no thousands separators).`;

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : undefined;
}

function isoDate(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extractPurchaseOrderFromPdf(
  bytes: Buffer,
  filename: string,
): Promise<ParsedPurchaseOrder | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!/\.pdf$/i.test(filename)) return null; // only PDFs for now

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
        max_tokens: 8192,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: bytes.toString("base64"),
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("Anthropic extract failed:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
    if (!text) return null;

    const raw = JSON.parse(stripFences(text)) as Record<string, unknown>;
    const items = Array.isArray(raw.items) ? raw.items : [];
    return {
      supplier: str(raw.supplier),
      reference: str(raw.reference),
      orderDate: isoDate(raw.orderDate),
      expectedDate: isoDate(raw.expectedDate),
      currency: str(raw.currency)?.toUpperCase().slice(0, 3),
      items: items
        .map((it) => {
          const o = (it ?? {}) as Record<string, unknown>;
          return {
            name: str(o.name) ?? "(naamloos)",
            sku: str(o.sku),
            units: num(o.units),
            unitPrice: num(o.unitPrice),
            note: str(o.note),
          };
        })
        .filter((it) => it.name !== "(naamloos)" || it.units !== 0),
    };
  } catch (err) {
    console.warn("Anthropic extract error:", err);
    return null;
  }
}
