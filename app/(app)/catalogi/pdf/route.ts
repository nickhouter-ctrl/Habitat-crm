import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { renderCatalogPdf } from "@/lib/catalog-pdf";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { localizeEthick } from "@/lib/ethick-i18n";
import { translateGroup, type PricelistItem, type PricelistLocale } from "@/lib/pricelist-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOCALES: PricelistLocale[] = ["nl", "de", "en", "es"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const collection = url.searchParams.get("collection") || "";
  const category = url.searchParams.get("category") || "";
  const langParam = url.searchParams.get("lang") ?? "nl";
  const locale: PricelistLocale = LOCALES.includes(langParam as PricelistLocale)
    ? (langParam as PricelistLocale)
    : "nl";

  const filters = [
    collection ? eq(products.collection, collection) : undefined,
    category ? eq(products.category, category) : undefined,
    eq(products.isActive, true),
  ].filter(Boolean) as never[];

  const rows = await db
    .select()
    .from(products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.collection), asc(products.category), asc(products.name));

  const groupBy = collection ? "category" : "collection";
  const items: PricelistItem[] = rows.map((p) => {
    // ETHICK-producten: merkvrije, gelokaliseerde naam.
    const loc = localizeEthick(p, locale);
    return {
      name: loc?.name ?? p.name,
      sku: p.sku ?? null,
      description: loc?.description ?? p.description ?? null,
      descriptionI18n: null,
      imageUrl: p.imageUrl ?? null,
      widthMm: p.widthMm ?? null,
      heightMm: p.heightMm ?? null,
      lengthMm: p.lengthMm ?? null,
      thicknessMm: p.thicknessMm ?? null,
      additionalSizes: null,
      unit: p.unit ?? null,
      priceEur: p.priceEur ?? null,
      vatRate: p.vatRate ?? 21,
      group: ((groupBy === "category" ? p.category : p.collection) ?? "Overige").trim(),
    };
  });

  const subtitle = collection ? translateGroup(collection, locale) : null;
  const pdf = await renderCatalogPdf({ items, subtitle, locale });
  const filename = `habitat-one-catalogus-${locale}${
    collection ? "-" + collection.toLowerCase().replace(/\s+/g, "-") : ""
  }.pdf`.replace(/[^a-z0-9.-]/gi, "-");

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
