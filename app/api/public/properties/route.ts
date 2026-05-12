import { and, desc, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { properties } from "@/lib/db/schema";

// Runs per request (the marketing site does its own ISR + on-demand revalidation).
export const dynamic = "force-dynamic";

/**
 * Public read-only feed of published properties — consumed by the marketing
 * site (habitat-one). No auth: only `isPublished` properties, and "sold"/
 * "withdrawn" ones are omitted.
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
        "cache-control":
          "public, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
