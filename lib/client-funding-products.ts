import type { DocumentLineItem } from "./db/schema";
import { isOwnProductLine, lineNet, normalizeDocItems } from "./documents";
import { splitReceipt, type ReceiptLike } from "./receipts";

type ProductDocument = {
  id: string; docNumber: string | null; kind: string; status: string; items: unknown;
};
export type ClientFundingProduct = {
  documentNumber: string | null;
  products: string[];
  received: number;
};

/** Customer-safe explanation of the exact product receipt total. Group by source
 * document, not invoice value: partial payments, refunds and settled advances
 * must reconcile with the same split used in the project balance.
 * All inputs must be from the same authorized project.
 */
export function clientFundingProducts(
  docs: ProductDocument[], payments: ReceiptLike[], shares: ReadonlyMap<string, number>,
  productCost?: (item: DocumentLineItem) => number | undefined,
): ClientFundingProduct[] {
  const byId = new Map(docs.map(d => [d.id, d]));
  const cents = new Map<string, number>();
  for (const p of payments) {
    if (!p.documentId) continue;
    const amount = Math.round(splitReceipt(p, shares).ownProductReceived * 100);
    cents.set(p.documentId, (cents.get(p.documentId) ?? 0) + amount);
  }
  return [...cents].filter(([, amount]) => amount !== 0).map(([id, amount]) => {
    const doc = byId.get(id);
    const settledOn = docs.filter(d => d.kind === "invoice" && !["draft", "void"].includes(d.status)
      && normalizeDocItems(d.items).some(it => it.advanceRef === id && lineNet(it) < 0));
    const sources = [...(doc ? [doc] : []), ...settledOn];
    return {
      documentNumber: doc?.docNumber ?? null,
      products: [...new Set(sources.flatMap(d => normalizeDocItems(d.items)
        .filter(it => isOwnProductLine(it, productCost) && lineNet(it) !== 0)
        .map(it => it.name.trim()).filter(Boolean)))],
      received: amount / 100,
    };
  }).sort((a, b) => (a.documentNumber ?? "").localeCompare(b.documentNumber ?? ""));
}
