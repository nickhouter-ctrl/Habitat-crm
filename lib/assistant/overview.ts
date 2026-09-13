import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { documents, products } from "@/lib/db/schema";
import { normalizeDocItems } from "@/lib/documents";
import { checkQuote } from "./quote-checks";
export async function loadQuoteChecks() {
  const docs = await db.select({ id: documents.id, title: documents.title, number: documents.docNumber, items: documents.items })
    .from(documents).where(and(eq(documents.kind, "estimate"), eq(documents.status, "draft")))
    .orderBy(desc(documents.updatedAt)).limit(100);
  const ids = [...new Set(docs.flatMap(d => normalizeDocItems(d.items).flatMap(i => i.productId ? [i.productId] : [])))];
  const prices = ids.length ? await db.select({ id: products.id, price: products.priceEur }).from(products).where(inArray(products.id, ids)) : [];
  const catalog = new Map(prices.filter(p => p.price != null).map(p => [p.id, Number(p.price)]));
  return docs.map(d => ({ ...d, checks: checkQuote(normalizeDocItems(d.items), catalog) }));
}
