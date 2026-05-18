/**
 * Exporteer producten met barcode als CSV — format geschikt voor import
 * in MijnGS1 / Verified by GS1.
 *
 * Query params:
 *   ?since=YYYY-MM-DD  → alleen producten met barcode gegenereerd na deze datum
 *                         (gebruikt updatedAt — handig voor 'nieuwe barcodes'-batch)
 *   ?onlyMissing=1     → alleen niet-geregistreerde (placeholder)
 */
import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";

import { auth } from "@/auth";
import { COMPANY } from "@/lib/company";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const onlyNew = url.searchParams.get("onlyNew") === "1";

  // Selecteer alle producten met barcode (eventueel sinds datum)
  const conditions = [isNotNull(products.barcode)];
  if (since) {
    conditions.push(gte(products.updatedAt, new Date(since)));
  }

  const rows = await db
    .select({
      barcode: products.barcode,
      sku: products.sku,
      name: products.name,
      description: products.description,
      category: products.category,
      collection: products.collection,
      widthMm: products.widthMm,
      heightMm: products.heightMm,
      thicknessMm: products.thicknessMm,
      lengthMm: products.lengthMm,
      unit: products.unit,
      priceEur: products.priceEur,
      imageUrl: products.imageUrl,
    })
    .from(products)
    .where(and(...conditions))
    .orderBy(products.barcode);

  // CSV-header — kolomnamen die MijnGS1 web-portal accepteert
  const header = [
    "GTIN",
    "Brand Name",
    "Product Description NL",
    "Product Description EN",
    "Category",
    "Sub-Collection",
    "Length (mm)",
    "Width (mm)",
    "Height (mm)",
    "Thickness (mm)",
    "Unit",
    "Net Price EUR (excl BTW)",
    "Net Price EUR (incl BTW)",
    "Image URL",
    "Internal SKU",
    "Target Market",
    "Brand Owner GLN",
  ];
  const lines: string[] = [header.map(csvEscape).join(";")];

  for (const r of rows) {
    const exVat = r.priceEur ? Number(r.priceEur) : null;
    const inVat = exVat != null ? Math.round(exVat * 1.21 * 100) / 100 : null;
    lines.push(
      [
        r.barcode,
        COMPANY.name, // Brand
        r.name,
        r.description ?? r.name,
        r.collection ?? "",
        r.category ?? "",
        r.lengthMm ?? "",
        r.widthMm ?? "",
        r.heightMm ?? "",
        r.thicknessMm ?? "",
        r.unit ?? "stuk",
        exVat != null ? exVat.toFixed(2) : "",
        inVat != null ? inVat.toFixed(2) : "",
        r.imageUrl ?? "",
        r.sku ?? "",
        "ES", // Spain
        "", // GLN (later in te vullen)
      ]
        .map(csvEscape)
        .join(";"),
    );
  }

  const csv = "﻿" + lines.join("\n"); // BOM voor Excel-detectie
  const filename = `habitat-one-gs1-barcodes${since ? `-vanaf-${since}` : ""}.csv`;

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
