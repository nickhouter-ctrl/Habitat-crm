import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands, products } from "@/lib/db/schema";
import { apiAuth, apiJson, paging } from "@/lib/api-keys";
export const dynamic = "force-dynamic";

/** Actieve producten voor content: geen kostprijzen, voorraad of inkoopgegevens. */
export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  const url = new URL(req.url), { limit, offset } = paging(url);
  const q = url.searchParams.get("q")?.trim(), brand = url.searchParams.get("brand")?.trim();
  const category = url.searchParams.get("category")?.trim(), collection = url.searchParams.get("collection")?.trim();
  const where = and(eq(products.isActive, true),
    q ? or(ilike(products.name, `%${q}%`), ilike(products.sku, `%${q}%`), ilike(products.description, `%${q}%`)) : undefined,
    brand ? eq(brands.slug, brand) : undefined, category ? eq(products.category, category) : undefined, collection ? eq(products.collection, collection) : undefined);
  const rows = await db.select({
    id: products.id, sku: products.sku, name: products.name, slug: products.slug, brand: brands.name, brandSlug: brands.slug,
    collection: products.collection, category: products.category, subcategory: products.subcategory, description: products.description,
    unit: products.unit, priceEur: products.priceEur, priceFromEur: products.priceFromEur, vatRate: products.vatRate,
    widthMm: products.widthMm, heightMm: products.heightMm, lengthMm: products.lengthMm, thicknessMm: products.thicknessMm,
    imageUrl: products.imageUrl, heroAssetId: products.heroAssetId, specs: products.specs, availability: products.availability,
  }).from(products).leftJoin(brands, eq(brands.id, products.brandId)).where(where).orderBy(asc(products.name)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products).leftJoin(brands, eq(brands.id, products.brandId)).where(where);
  return apiJson({ total, limit, offset, data: rows.map((p) => ({ ...p, priceEur: p.priceEur == null ? null : Number(p.priceEur),
    priceFromEur: p.priceFromEur == null ? null : Number(p.priceFromEur),
    priceInclVatEur: p.priceEur == null ? null : Math.round(Number(p.priceEur) * (1 + (p.vatRate ?? 21) / 100) * 100) / 100 })) });
}
