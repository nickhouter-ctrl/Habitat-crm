import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { localizeEthick } from "@/lib/ethick-i18n";
import { renderPricelistPdf, translateGroup, type PricelistItem, type PricelistLocale } from "@/lib/pricelist-pdf";

const LOCALES: PricelistLocale[] = ["nl", "de", "en", "es"];

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const collection = url.searchParams.get("collection") || "";
  const category = url.searchParams.get("category") || "";
  const onlyActive = url.searchParams.get("onlyActive") === "on";
  const onlyWithPrice = url.searchParams.get("onlyWithPrice") === "on";
  const onlyInStock = url.searchParams.get("onlyInStock") === "on";
  const audience = url.searchParams.get("audience") === "trade" ? "trade" : "particulier";
  const langParam = url.searchParams.get("lang") ?? "nl";
  const locale: PricelistLocale = LOCALES.includes(langParam as PricelistLocale)
    ? (langParam as PricelistLocale)
    : "nl";

  const filters = [
    collection ? eq(products.collection, collection) : undefined,
    category ? eq(products.category, category) : undefined,
    onlyActive ? eq(products.isActive, true) : undefined,
    onlyWithPrice ? isNotNull(products.priceEur) : undefined,
    onlyInStock ? sql`coalesce(${products.stockQty}, 0) > 0` : undefined,
  ].filter(Boolean) as never[];

  const rows = await db
    .select()
    .from(products)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(products.collection), asc(products.category), asc(products.name));

  const groupBy = collection ? "category" : "collection";
  const items: PricelistItem[] = rows.map((p) => {
    // ETHICK-bloempotten/-loungers: naam + omschrijving gelokaliseerd opbouwen.
    const loc = localizeEthick(p, locale);
    return {
      name: loc?.name ?? p.name,
      sku: p.sku ?? null,
      description: loc?.description ?? p.description ?? null,
      descriptionI18n: loc
        ? null
        : ((p.descriptionI18n as Partial<Record<PricelistLocale, string>> | null) ?? null),
      imageUrl: p.imageUrl ?? null,
      widthMm: p.widthMm ?? null,
      heightMm: p.heightMm ?? null,
      lengthMm: p.lengthMm ?? null,
      thicknessMm: p.thicknessMm ?? null,
      additionalSizes: (p.additionalSizes as Array<{ sku: string; label: string }> | null) ?? null,
      unit: p.unit ?? null,
      priceEur: audience === "trade" ? (p.tradePriceEur ?? p.priceEur ?? null) : (p.priceEur ?? null),
      vatRate: p.vatRate ?? 21,
      group: ((groupBy === "category" ? p.category : p.collection) ?? "Overige").trim(),
    };
  });

  const TRADE_LABEL: Record<PricelistLocale, string> = {
    nl: "Aannemers / architecten",
    de: "Bauunternehmer / Architekten",
    en: "Contractors / architects",
    es: "Constructores / arquitectos",
  };
  const subtitleParts: string[] = [];
  if (audience === "trade") subtitleParts.push(TRADE_LABEL[locale]);
  if (collection) subtitleParts.push(translateGroup(collection, locale));
  if (category) subtitleParts.push(translateGroup(category, locale));
  const subtitle = subtitleParts.length ? subtitleParts.join(" · ") : null;

  const pdf = await renderPricelistPdf({ items, subtitle, locale });
  const filename = `habitat-one-prijslijst-${audience === "trade" ? "trade-" : ""}${locale}${collection ? "-" + collection.toLowerCase().replace(/\s+/g, "-") : ""}.pdf`.replace(/[^a-z0-9.-]/gi, "-");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
