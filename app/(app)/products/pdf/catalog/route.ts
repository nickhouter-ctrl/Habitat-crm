import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { computeKitStock, getReservedStockByProduct, type KitComponent } from "@/lib/stock";
import { renderProductStockCatalog, type StockCatalogItem } from "@/lib/product-stock-catalog-pdf";
import { weigerRoute } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

function allowedAssetUrl(raw: string | null | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowed = new Set(["habitat-one-ecru.vercel.app", "www.habitat-one.com", "habitat-one.com", "kcsqmsmferruwnhsibxk.supabase.co", "cdn.shopify.com", "www.corneliuslifestyle.com"]);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && allowed.has(url.hostname) ? url : null;
  } catch { return null; }
}

async function safeImage(raw: string | null | undefined): Promise<string | null> {
  const url = allowedAssetUrl(raw);
  if (!url) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.body || !/^image\/(jpeg|png|webp|avif)$/i.test(response.headers.get("content-type") ?? "")) return null;
    if (Number(response.headers.get("content-length")) > 8_000_000) { await response.body.cancel(); return null; }
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8_000_000) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const { default: sharp } = await import("sharp");
    const image = await sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 }).rotate().resize(360, 440, { fit: "cover", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${image.toString("base64")}`;
  } catch { return null; }
}

export async function GET(request: Request) {
  const denied = await weigerRoute("producten");
  if (denied) return denied;

  const category = new URL(request.url).searchParams.get("category")?.trim() ?? "";
  if (category.length > 120) return new Response("Invalid product type", { status: 400 });
  const locale = "en";
  const [rows, reserved] = await Promise.all([
    db.query.products.findMany({ where: and(eq(products.isActive, true), category ? eq(products.category, category) : undefined), orderBy: [asc(products.category), asc(products.name)] }),
    getReservedStockByProduct(),
  ]);
  const skuSet = new Set(rows.flatMap(row => (row.components as KitComponent[] | null ?? []).map(part => part.sku)));
  const componentRows = skuSet.size ? await db.select({ id: products.id, sku: products.sku, stockQty: products.stockQty }).from(products).where(inArray(products.sku, [...skuSet])) : [];
  const availableBySku = new Map<string, number>();
  for (const row of componentRows) if (row.sku) availableBySku.set(row.sku, Math.max(0, Number(row.stockQty ?? 0) - (reserved.get(row.id) ?? 0)));

  const items: StockCatalogItem[] = [];
  const imageUrls: Array<string | null> = [];
  for (const row of rows) {
    if (row.availability === "order_only") continue;
    const names = row.nameI18n as { nl?: string; en?: string; es?: string; de?: string } | null;
    const name = names?.en || row.name;
    const dims = [row.lengthMm, row.widthMm, row.heightMm].filter(v => v != null && Number(v) > 0).map(v => `${Number(v)} mm`).join(" × ") || null;
    const components = row.components as KitComponent[] | null;
    const baseQty = components?.length
      ? computeKitStock(components, availableBySku)
      : Math.max(0, Number(row.stockQty ?? 0) - (reserved.get(row.id) ?? 0));
    if (baseQty > 0) {
      items.push({ name, sku: row.sku, category: row.category, unit: row.unit, quantity: baseQty, price: row.priceEur == null ? null : Number(row.priceEur), vatRate: row.vatRate ?? 21, image: null, dimensions: dims });
      imageUrls.push(row.imageUrl);
    }

    // Product variants such as panel sizes keep their own stock and price in
    // additionalSizes; list only variants that currently have stock.
    const sizes = row.additionalSizes as Array<{ sku: string; label: string; priceEur?: number | null; stockQty?: number | null; imageUrl?: string | null }> | null;
    for (const size of sizes ?? []) {
      const qty = Math.max(0, Number(size.stockQty ?? 0));
      if (!qty) continue;
      items.push({ name, sku: size.sku || row.sku, category: row.category, unit: row.unit, quantity: qty, price: size.priceEur == null ? (row.priceEur == null ? null : Number(row.priceEur)) : Number(size.priceEur), vatRate: row.vatRate ?? 21, image: null, dimensions: size.label || dims });
      imageUrls.push(size.imageUrl || row.imageUrl);
    }
  }

  const imageCache = new Map<string, Promise<string | null>>();
  let nextImage = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (nextImage < items.length) {
      const index = nextImage++, url = imageUrls[index];
      if (!url) continue;
      if (!imageCache.has(url)) imageCache.set(url, safeImage(url));
      items[index].image = await imageCache.get(url)!;
    }
  }));

  const generatedAt = new Date();
  const pdf = await renderProductStockCatalog({ items, locale, generatedAt, category: category || undefined });
  const today = generatedAt.toISOString().slice(0, 10);
  const suffix = category ? `-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return new Response(new Uint8Array(pdf), { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="Habitat-One-stock-catalog${suffix}-${today}.pdf"`,
    "cache-control": "no-store, max-age=0, must-revalidate",
  } });
}
