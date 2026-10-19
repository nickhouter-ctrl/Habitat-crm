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
    for (const size of product.additionalSizes ?? []) {
      if (size.sku) bySku.set(size.sku, cost(size.costEur));
    }
  }
  return (line: CatalogLine): number | undefined => {
    const description = line.description?.trim() ?? "";
    const sku = description.split(" · ").at(-1)?.trim() ?? "";
    const product = line.productId ? byId.get(line.productId) : undefined;
    if (product) {
      const sizes = product.additionalSizes ?? [];
      const selected = sizes.find(size => size.sku && size.sku === sku)
        ?? sizes.find(size => description === size.label || line.name === `${product.name} — ${size.label}`);
      if (selected) return cost(selected.costEur);
      // An obsolete/unknown variant code must not inherit a different size's cost.
      if (sizes.length && description.includes(" · ")) return undefined;
      return cost(product.costEur);
    }
    return bySku.get(sku);
  };
}
