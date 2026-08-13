/**
 * Websitebron van de asset-bibliotheek (brief §5).
 *
 * De brief vraagt de productcatalogus van habitat-one.com te spiegelen en
 * HTML-parsen te vermijden. Dat kan hier zonder website-endpoint: dit CRM is
 * zélf de bron van de website-productbeelden (lib/website/push.ts pusht
 * `products.imageUrl` naar de site, gematcht op SKU). We spiegelen dus de
 * beelden van alle producten die op de website staan (websiteProductId
 * gevuld, of pushToWebsite aan) — geen HTML-parsing, geen extra endpoint.
 *
 * GET  — Vercel-cron (Bearer CRON_SECRET).
 * POST — handmatige trigger (ingelogd, geen viewer — dit schrijft assets).
 *
 * Beelden worden sequentieel verwerkt: de ingest-duplicaatdetectie heeft een
 * kleine TOCTOU-race bij parallelle verwerking van dezelfde bron.
 */
import { and, eq, isNotNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";

import { emptySummary, fetchImageBytes, ingestFromBytes, tally } from "../../_ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function runSync(): Promise<NextResponse> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      slug: products.slug,
      name: products.name,
      imageUrl: products.imageUrl,
      collection: products.collection,
      category: products.category,
    })
    .from(products)
    .where(
      and(
        isNotNull(products.imageUrl),
        or(isNotNull(products.websiteProductId), eq(products.pushToWebsite, true)),
      ),
    );

  const summary = emptySummary();
  for (const product of rows) {
    if (!product.imageUrl) continue;
    try {
      const { bytes, contentType } = await fetchImageBytes(product.imageUrl);
      const result = await ingestFromBytes({
        bytes,
        contentType,
        source: "website",
        sourceRef: product.slug ?? product.sku ?? product.id,
        sourceUrl: product.imageUrl,
        productId: product.id,
        tags: [product.collection, product.category].filter((t): t is string => !!t),
      });
      tally(summary, result);
    } catch (err) {
      summary.errors.push(
        `${product.name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json(
    { ok: summary.errors.length === 0, ...summary },
    { status: summary.errors.length === 0 ? 200 : 207 },
  );
}

export async function GET(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  return runSync();
}

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: synchroniseren is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }
  return runSync();
}
