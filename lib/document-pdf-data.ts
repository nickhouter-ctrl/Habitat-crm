/** Server-side verrijking van documentregels voor de PDF (SKU + maatvoering). */
import { inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { products, type DocumentLineItem } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { formatDimensions } from "@/lib/products";

export type PdfLineItem = DocumentLineItem & { sku: string | null; dim: string | null };

/**
 * Verrijk documentregels voor de PDF met gegevens van het gekoppelde product:
 * de SKU en de maatvoering ("2800 × 1220 mm · t 3 mm"). Regels van een
 * maat-variant (`additionalSizes`) hebben het gekozen maat-label al in de
 * naam/omschrijving staan — die krijgen geen extra dim-regel.
 */
export async function enrichDocItemsForPdf(raw: unknown): Promise<{
  items: PdfLineItem[];
  /** productId → imageUrl — voor de productfoto's op de pakbon. */
  productImages: Record<string, string>;
}> {
  const base = normalizeDocItems(raw);
  const pids = [...new Set(base.map((it) => it.productId).filter((x): x is string => !!x))];
  const rows = pids.length
    ? await db
        .select({
          id: products.id,
          sku: products.sku,
          imageUrl: products.imageUrl,
          widthMm: products.widthMm,
          heightMm: products.heightMm,
          lengthMm: products.lengthMm,
          thicknessMm: products.thicknessMm,
          additionalSizes: products.additionalSizes,
        })
        .from(products)
        .where(inArray(products.id, pids))
    : [];
  const byId = new Map(rows.map((p) => [p.id, p]));

  const productImages: Record<string, string> = {};
  for (const p of rows) if (p.imageUrl) productImages[p.id] = p.imageUrl;

  const items = base.map((it) => {
    const p = it.productId ? byId.get(it.productId) : undefined;
    let dim: string | null = null;
    if (p) {
      const text = `${it.name} ${it.description ?? ""}`.toLowerCase();
      const sizeOnLine = (p.additionalSizes ?? []).some(
        (s) => s.label && text.includes(s.label.toLowerCase()),
      );
      dim = sizeOnLine ? null : formatDimensions(p);
    }
    return { ...it, sku: p?.sku ?? null, dim };
  });

  return { items, productImages };
}
