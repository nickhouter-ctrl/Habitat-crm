import { isOwnProductLine, lineNet, normalizeDocItems } from "./documents";
import { receiptExVat, type ReceiptLike } from "./receipts";

type AdvanceDocument = {
  id: string; kind: string; status: string; docNumber: string | null;
  items: unknown; subtotalEur: string; issueDate: string | null;
  isAdvance: boolean; settledAt: Date | null;
  sourceDocumentId?: string | null;
};
type Payment = ReceiptLike & { id: string; date: string | null; description: string | null };
const round = (n: number) => Math.round(n * 100) / 100;
const advanceName = /\b(voorschot\w*|aanbetaling\w*|termijn\w*|term|advance|deposit|anticipo\w*|provisi[oó]n)\b/i;

/** Actual receipts are authoritative; document status alone never creates cash.
 * Mixed invoices contribute only their advance lines, excluding all goods.
 * All inputs must belong to the same authorized project.
 */
export function projectAdvanceLedger(docs: AdvanceDocument[], payments: Payment[]) {
  const signature = (d: AdvanceDocument) => JSON.stringify(normalizeDocItems(d.items).map(it =>
    [it.name, it.units, it.price, it.discount ?? 0, it.taxRate ?? 21, it.productId ?? null]));
  const settlements = new Map<string, number>();
  for (const d of docs) {
    if (d.kind !== "invoice" || ["draft", "void"].includes(d.status)) continue;
    for (const it of normalizeDocItems(d.items)) if (it.advanceRef && lineNet(it) < 0)
      settlements.set(it.advanceRef, (settlements.get(it.advanceRef) ?? 0) - lineNet(it));
  }
  const rows = docs.flatMap(d => {
    if (!["invoice", "proforma", "fondos"].includes(d.kind) || d.status === "void") return [];
    const items = normalizeDocItems(d.items);
    const amount = round(items.reduce((sum, it) => sum + (!isOwnProductLine(it) && !it.advanceRef && lineNet(it) > 0
      && (d.isAdvance || d.kind === "fondos" || d.kind === "proforma" || advanceName.test(it.name)) ? lineNet(it) : 0), 0));
    if (amount <= 0) return [];
    const ownPayments = payments.filter(p => p.documentId === d.id);
    const base = Number(d.subtotalEur);
    const received = round(ownPayments.reduce((sum, p) => sum + receiptExVat(p), 0) * (base > 0 ? Math.min(1, amount / base) : 0));
    const settled = round(Math.min(Math.max(0, received), settlements.get(d.id) ?? (d.settledAt ? Math.max(0, received) : 0)));
    const successors = d.kind === "proforma" ? docs.filter(invoice => invoice.kind === "invoice" && !["draft","void"].includes(invoice.status)
      && (invoice.sourceDocumentId === d.id || (d.sourceDocumentId && invoice.sourceDocumentId === d.sourceDocumentId
        && invoice.subtotalEur === d.subtotalEur && signature(invoice) === signature(d)))) : [];
    const replacedBy = successors.length === 1 ? { id: successors[0].id, label: successors[0].docNumber ?? "Factuur" } : null;
    return [{ id: d.id, documentId: d.id as string | null, label: d.docNumber ?? d.kind,
      date: d.issueDate, kind: d.kind, status: d.status, amount, received, settled,
      open: round(received - settled), payments: ownPayments, replacedBy }];
  });
  for (const p of payments) {
    if (p.documentId) continue;
    const received = round(receiptExVat(p));
    const settled = round(Math.min(Math.max(0, received), settlements.get(p.id) ?? 0));
    rows.push({ id: p.id, documentId: null, label: p.description ?? "Voorschot", date: p.date,
      kind: "payment", status: "paid", amount: received, received, settled,
      open: round(received - settled), payments: [p], replacedBy: null });
  }
  rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.id.localeCompare(b.id));
  return { rows, received: round(rows.reduce((s, r) => s + r.received, 0)),
    settled: round(rows.reduce((s, r) => s + r.settled, 0)),
    open: round(rows.reduce((s, r) => s + r.open, 0)) };
}
