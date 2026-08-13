/**
 * Websitebron van de asset-bibliotheek (brief §5 + U9).
 *
 * Twee delen:
 * 1. Productbeelden — zonder HTML-parsing: dit CRM is zélf de bron van de
 *    website-productbeelden (lib/website/push.ts pusht `products.imageUrl`
 *    naar de site, gematcht op SKU).
 * 2. Project- en inspiratiemedia (U9) — /projects (incl. before/after) en
 *    /inspiration/{events,news,tips,blog}: hiervoor bestaat geen JSON-bron,
 *    dus die pagina's worden bewust wél geparset (lib/marketing/
 *    website-crawl.ts). Afbeeldingen én video's door de bestaande ingest;
 *    YouTube/Vimeo-embeds als verwijzing. Tags per sectie + interieur/
 *    exterieur waar afleidbaar.
 *
 * GET  — Vercel-cron (Bearer CRON_SECRET; zie vercel.json, dagelijks 04:00).
 * POST — handmatige trigger (ingelogd, geen viewer — dit schrijft assets).
 *
 * Alles sequentieel: de ingest-duplicaatdetectie heeft een kleine TOCTOU-race
 * bij parallelle verwerking van dezelfde bron.
 */
import { and, eq, isNotNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { requireCron } from "@/lib/auth/require-cron";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { isVideoContentType } from "@/lib/marketing/video";
import { crawlWebsiteMedia } from "@/lib/marketing/website-crawl";

import {
  emptySummary,
  fetchImageBytes,
  ingestFromBytes,
  ingestVideoFromBytes,
  recordEmbedAsset,
  tally,
} from "../../_ingest";

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

  // -- Deel 2 (U9): project- en inspiratiemedia, incl. video's en embeds.
  const crawl = await crawlWebsiteMedia();
  summary.errors.push(...crawl.errors);
  for (const page of crawl.pages) {
    for (const imageUrl of page.media.images) {
      try {
        const { bytes, contentType } = await fetchImageBytes(imageUrl);
        const result = await ingestFromBytes({
          bytes,
          contentType,
          source: "website",
          sourceRef: imageUrl.split("/").at(-1) ?? imageUrl,
          sourceUrl: page.url,
          tags: page.tags,
        });
        tally(summary, result);
      } catch (err) {
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const videoUrl of page.media.videos) {
      try {
        const { bytes, contentType } = await fetchImageBytes(videoUrl, 100 * 1024 * 1024);
        const type = isVideoContentType(contentType)
          ? contentType
          : videoUrl.endsWith(".webm")
            ? "video/webm"
            : "video/mp4";
        const result = await ingestVideoFromBytes({
          bytes,
          contentType: type,
          source: "website",
          sourceRef: videoUrl.split("/").at(-1) ?? videoUrl,
          sourceUrl: page.url,
          tags: page.tags,
        });
        tally(summary, result);
      } catch (err) {
        summary.errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    for (const embed of page.media.embeds) {
      try {
        const result = await recordEmbedAsset({ ...embed, pageUrl: page.url, tags: page.tags });
        tally(summary, result);
      } catch (err) {
        summary.errors.push(`Embed ${embed.url}: ${err instanceof Error ? err.message : String(err)}`);
      }
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
