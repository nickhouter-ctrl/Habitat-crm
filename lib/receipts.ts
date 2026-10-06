/**
 * Ontvangst-helpers, gedeeld door projectdetail en projectenlijst zodat beide
 * exact hetzelfde rekenen. Pure functies — geen db-imports.
 */

export type ReceiptLike = {
  method: string;
  amountEur: string | number | null;
  vatRate?: string | null;
  vatAmountEur?: string | null;
  documentId?: string | null;
  advanceRequestId?: string | null;
  docSubtotal?: string | null;
  docTotal?: string | null;
};

/** Invoice payments can include VAT; unbilled advances contain no VAT. */
const VAT_DIVISOR = 1.21;

/** Unbilled project advances are settled in full on the final invoice. */
export function defaultReceiptVatRate(p: Pick<ReceiptLike, "method" | "advanceRequestId">): number {
  return p.method === "cash" || p.method === "advance" || p.advanceRequestId ? 0 : 21;
}

/**
 * Ex. btw per ontvangst, niet blind alles ÷ 1,21:
 *  - contant en losse voorschotten: geen btw; voorschotten worden bij de
 *    eindafrekening verrekend (opgave van Nick, 06-10-2026);
 *  - hangt de ontvangst aan een factuur: de verhouding van díé factuur, dus
 *    ook goed bij btw verlegd of een provisión de fondos zonder btw;
 *  - de rest: 21% aannemen, zoals het altijd al ging.
 */
export function receiptExVat(p: ReceiptLike): number {
  const bedrag = Number(p.amountEur ?? 0);
  // Een vastgelegd btw-BEDRAG wint: bij gemengde tarieven (deels 21%, deels
  // 10%) komt geen enkel percentage op de cent uit.
  if (p.vatAmountEur != null && p.vatAmountEur !== "") {
    const btw = Number(p.vatAmountEur);
    if (Number.isFinite(btw)) return Math.round((bedrag - btw) * 100) / 100;
  }
  // Expliciet ingevuld tarief wint altijd: een voorschot kan mét of zonder
  // btw zijn en dat valt niet uit de betaalwijze af te leiden.
  if (p.vatRate != null && p.vatRate !== "") {
    const pct = Number(p.vatRate);
    if (Number.isFinite(pct)) return Math.round((bedrag / (1 + pct / 100)) * 100) / 100;
  }
  if (p.method === "cash") return bedrag;
  const sub = Number(p.docSubtotal ?? 0);
  const tot = Number(p.docTotal ?? 0);
  if (sub > 0 && tot > 0) return Math.round(bedrag * (sub / tot) * 100) / 100;
  return defaultReceiptVatRate(p) === 0 ? bedrag : bedrag / VAT_DIVISOR;
}

/**
 * Ontvangen dekking (ex. btw) voor de voorschotsom: alle ontvangsten, maar van
 * betalingen die aan een factuur hangen alleen het deel dat géén eigen
 * producten is (het aandeel per document komt uit `docOwnShare` in
 * lib/documents.ts). Voorschotten zonder document tellen volledig mee; een
 * betaling op een document zonder bekend aandeel ook.
 */
export function coverReceivedEx(payments: ReceiptLike[], ownShareByDoc: Map<string, number>): number {
  return splitProjectReceipts(payments, ownShareByDoc).liquidReceived;
}

export function splitReceipt(p: ReceiptLike, ownShareByDoc: ReadonlyMap<string, number>) {
  const totalReceived = Math.round(receiptExVat(p) * 100) / 100;
  const rawShare = p.documentId ? ownShareByDoc.get(p.documentId) ?? 0 : 0;
  const share = Number.isFinite(rawShare) ? Math.max(0, Math.min(1, rawShare)) : 0;
  const ownProductReceived = Math.round(totalReceived * share * 100) / 100;
  // Subtract rounded amounts so every displayed row reconciles to the cent.
  const liquidReceived = Math.round((totalReceived - ownProductReceived) * 100) / 100;
  return { totalReceived, ownProductReceived, liquidReceived };
}

/** Partial payments and refunds follow their linked document's goods/work split.
 * Unlinked advances stay available for work; unpaid documents create no receipt.
 */
export function splitProjectReceipts(payments: ReceiptLike[], ownShareByDoc: ReadonlyMap<string, number>) {
  let totalCents = 0, ownCents = 0;
  for (const p of payments) {
    const receipt = splitReceipt(p, ownShareByDoc);
    totalCents += Math.round(receipt.totalReceived * 100);
    ownCents += Math.round(receipt.ownProductReceived * 100);
  }
  return { totalReceived: totalCents / 100, ownProductReceived: ownCents / 100, liquidReceived: (totalCents - ownCents) / 100 };
}
