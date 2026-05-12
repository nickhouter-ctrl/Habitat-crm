import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";

// Always fresh — the marketing site reads this with `no-store`, so unpublishing
// or changing a property's status shows up right away.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public read-only feed of properties — consumed by the marketing site
 * (habitat-one). No auth. Returns every property with `isPublished = true`
 * (any status); the site shows available ones in the main grid and
 * sold/withdrawn ones in a separate "no longer available" section.
 */
export async function GET() {
  const rows = await db.query.properties.findMany({
    where: eq(properties.isPublished, true),
    orderBy: [desc(properties.updatedAt)],
    columns: {
      id: true,
      reference: true,
      title: true,
      status: true,
      type: true,
      priceEur: true,
      bedrooms: true,
      bathrooms: true,
      builtSqm: true,
      plotSqm: true,
      location: true,
      description: true,
      images: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    { properties: rows, count: rows.length },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store, max-age=0",
      },
    },
  );
}
