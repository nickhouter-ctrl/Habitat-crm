import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";

// Always fresh — the marketing site reads this with `no-store`, so unpublishing
// or selling a property removes it from the site right away.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Public read-only feed for the marketing site (habitat-one). No auth.
 * Only properties that are `isPublished` and still available — sold/withdrawn
 * ones are not shown publicly.
 */
export async function GET() {
  const rows = await db.query.properties.findMany({
    where: and(
      eq(properties.isPublished, true),
      ne(properties.status, "sold"),
      ne(properties.status, "withdrawn"),
    ),
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
