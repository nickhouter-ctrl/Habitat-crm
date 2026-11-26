import type { DocumentLineItem } from "./db/schema";
import { isOwnProductLine, lineNet, lineUnitPrice, normalizeDocItems } from "./documents";
import { splitReceipt, type ReceiptLike } from "./receipts";

type ProductDocument = {
  id: string; docNumber: string | null; kind: string; status: string; items: unknown;
};
export type ClientFundingProduct = {
  documentNumber: string | null;
  products: string[];
  received: number;
  specifications?: {
    documentId: string;
    documentNumber: string | null;
    items: { name: string; quantity: number; unitPrice: number; total: number }[];
  }[];
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
    // Explicit customer-safe projection. Never spread invoice items (costs and
    // internal notes live on those objects). Preserve separate invoice lines,
    // even if their names match; discounts follow the invoice calculation.
    const specifications = sources.map(d => ({
      documentId: d.id,
      documentNumber: d.docNumber,
      items: normalizeDocItems(d.items)
        .filter(it => isOwnProductLine(it, productCost) && lineNet(it) !== 0)
        .map(it => ({ name: it.name.trim(), quantity: Number(it.units) || 0,
          unitPrice: lineUnitPrice(it), total: lineNet(it) })),
    })).filter(d => d.items.length > 0);
    return {
      documentNumber: doc?.docNumber ?? null,
      products: [...new Set(sources.flatMap(d => normalizeDocItems(d.items)
        .filter(it => isOwnProductLine(it, productCost) && lineNet(it) !== 0)
        .map(it => it.name.trim()).filter(Boolean)))],
      received: amount / 100,
      specifications,
    };
  }).sort((a, b) => (a.documentNumber ?? "").localeCompare(b.documentNumber ?? ""));
}

export type ClientDeliveredProduct = { date: string | null; documentNumber: string | null; name: string; quantity: number; total: number };

/**
 * Alle eigen producten die de klant (nog) moet betalen, tegen verkoopprijs:
 * leveringen op het project, productregels van facturen die níet volledig
 * gecrediteerd zijn, en meerwerk. Telt op tot dezelfde productwaarde als de
 * projectstand (projectOwnProducts + extras). Nick 26-11-2026: "het is niet
 * ontvangen, maar producten moeten wel laten zien worden en gespecificeerd".
 */
export function clientDeliveredProducts(input: {
  docs: (ProductDocument & { date?: string | null })[];
  credited: ReadonlySet<string>;
  /** Leveringen in dezelfde vorm als de projectstand ze als factuurregel meetelt, plus datum. */
  deliveries: (Record<string, unknown> & { date?: string | null })[];
  extras: { date?: string | null; description: string; amountEur: number | string }[];
  productCost?: (item: DocumentLineItem) => number | undefined;
}): ClientDeliveredProduct[] {
  const day = (d?: string | null) => (d ? String(d).slice(0, 10) : null);
  const cent = (n: number) => Math.round(n * 100) / 100;
  const settled = new Set(input.docs.filter(d => d.kind === "invoice" && !["draft", "void"].includes(d.status))
    .flatMap(d => normalizeDocItems(d.items).flatMap(it => it.advanceRef ? [it.advanceRef] : [])));
  const rows: ClientDeliveredProduct[] = [];
  for (const d of input.docs) {
    if (!["invoice", "creditnote", "fondos"].includes(d.kind) || ["draft", "void"].includes(d.status)) continue;
    if (input.credited.has(d.id) || (d.kind === "fondos" && settled.has(d.id))) continue;
    const sign = d.kind === "creditnote" ? -1 : 1;
    for (const it of normalizeDocItems(d.items)) {
      if (!isOwnProductLine(it, input.productCost) || lineNet(it) === 0) continue;
      rows.push({ date: day(d.date), documentNumber: d.docNumber, name: it.name.trim(), quantity: sign * (Number(it.units) || 0), total: cent(sign * lineNet(it)) });
    }
  }
  for (const l of input.deliveries) {
    const [it] = normalizeDocItems([l]);
    if (!it || !isOwnProductLine(it, input.productCost) || lineNet(it) === 0) continue;
    rows.push({ date: day(l.date), documentNumber: null, name: it.name.trim(), quantity: Number(it.units) || 0, total: cent(lineNet(it)) });
  }
  for (const e of input.extras) {
    const total = cent(Number(e.amountEur) || 0);
    if (total !== 0) rows.push({ date: day(e.date), documentNumber: null, name: e.description.trim(), quantity: 1, total });
  }
  return rows.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.name.localeCompare(b.name));
}
