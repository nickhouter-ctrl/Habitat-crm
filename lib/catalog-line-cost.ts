import { isOwnProductLine, lineMaterialCostEur, lineNet, normalizeDocItems } from "./documents";
import type { DocumentLineItem } from "./db/schema";

type CatalogProduct = {
  id: string;
  sku: string | null;
  name: string;
  costEur: string | number | null;
  additionalSizes?: Array<{ sku: string; label: string; costEur?: number | null }> | null;
};

type CatalogLine = { productId?: string; description?: string; name?: string };

const cost = (value: string | number | null | undefined): number | undefined => {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/** Resolve the selected size before the parent product. Unknown size costs stay unknown. */
export function catalogLineCost(products: CatalogProduct[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  const bySku = new Map<string, number | undefined>();
  for (const product of products) {
    if (product.sku) bySku.set(product.sku, cost(product.costEur));
    for (const size of Array.isArray(product.additionalSizes) ? product.additionalSizes : []) {
      if (size.sku) bySku.set(size.sku, cost(size.costEur));
    }
  }
  return (line: CatalogLine): number | undefined => {
    const description = line.description?.trim() ?? "";
    const sku = description.split(" · ").at(-1)?.trim() ?? "";
    const product = line.productId ? byId.get(line.productId) : undefined;
    if (product) {
      const sizes = Array.isArray(product.additionalSizes) ? product.additionalSizes : [];
      const selected = sizes.find(size => size.sku && size.sku === sku)
        ?? sizes.find(size => description === size.label || line.name === `${product.name} — ${size.label}`);
      if (selected) return cost(selected.costEur);
      // An obsolete/unknown variant code must not inherit a different size's cost.
      if (sizes.length && (
        description.includes(" · ")
        || (sku !== product.sku && (bySku.has(sku) || (!!product.sku && sku.startsWith(`${product.sku}-`))))
        || line.name?.startsWith(`${product.name} — `)
      )) return undefined;
      return cost(product.costEur);
    }
    return bySku.get(sku);
  };
}

/** Compare like-for-like product revenue and costs, with credits and missing costs explicit. */
export function invoiceProductMargin(
  docs: Array<{ items: unknown; issueDate: string | null; kind: string }>,
  productCost: (line: DocumentLineItem) => number | undefined,
  monthStart: string,
) {
  const empty = () => ({ revenue: 0, cost: 0, uncostedLines: 0 });
  const all = empty(), month = empty();
  for (const doc of docs) {
    const sign = doc.kind === "creditnote" ? -1 : 1;
    for (const item of normalizeDocItems(doc.items)) {
      if (!isOwnProductLine(item, productCost) || !item.units) continue;
      const cost = lineMaterialCostEur(item, productCost);
      for (const bucket of doc.issueDate && doc.issueDate >= monthStart ? [all, month] : [all]) {
        if (cost === 0) bucket.uncostedLines++;
        else {
          bucket.revenue += sign * lineNet(item);
          bucket.cost += sign * cost;
        }
      }
    }
  }
  const finish = (bucket: ReturnType<typeof empty>) => ({
    ...bucket,
    marginPct: bucket.revenue > 0 ? Math.round((bucket.revenue - bucket.cost) / bucket.revenue * 100) : null,
  });
  return { all: finish(all), month: finish(month) };
}
