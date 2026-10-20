import { cache } from "react";
import { db } from "@/lib/db";
import { catalogLineCost } from "@/lib/catalog-line-cost";

/** Include variant SKUs and inactive historical products. Deduplicate within a render. */
export const loadCatalogLineCost = cache(async () => catalogLineCost(
  await db.query.products.findMany({
    columns: { id: true, sku: true, name: true, costEur: true, additionalSizes: true },
  }),
));
