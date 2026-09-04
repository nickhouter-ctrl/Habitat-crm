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
  docSubtotal?: string | null;
  docTotal?: string | null;
};

/** Betalingen worden incl. btw geboekt; de samenvattingen rekenen ex. btw (÷1,21). */
const VAT_DIVISOR = 1.21;

/**
 * Ex. btw per ontvangst, niet blind alles ÷ 1,21:
 *  - contant: daar zit geen btw op (opgave van Nick, 04-08-2026);
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
  return bedrag / VAT_DIVISOR;
}

/**
 * Ontvangen dekking (ex. btw) voor de voorschotsom: alle ontvangsten, maar van
 * betalingen die aan een factuur hangen alleen het deel dat géén eigen
 * producten is (het aandeel per document komt uit `docOwnShare` in
 * lib/documents.ts). Voorschotten zonder document tellen volledig mee; een
 * betaling op een document zonder bekend aandeel ook — veilige default.
 */
export function coverReceivedEx(payments: ReceiptLike[], ownShareByDoc: Map<string, number>): number {
  let som = 0;
  for (const p of payments) {
    const share = p.documentId ? (ownShareByDoc.get(p.documentId) ?? 0) : 0;
    som += receiptExVat(p) * (1 - share);
  }
  return Math.round(som * 100) / 100;
}
