/**
 * Handmatige upload naar de asset-bibliotheek (brief §5 + U7). Beelden gaan
 * door exact dezelfde verwerkingspijplijn als de website- en Instagram-sync
 * (afmetingen, perceptuele hash + duplicaatdetectie, dominante kleuren);
 * video's door de video-pijplijn (dedupe op inhoudshash, geen phash).
 *
 * POST multipart/form-data:
 *   file       — één of meer bestanden (beeld: jpeg/png/webp/avif ≤ 25 MB;
 *                video: mp4/mov/webm ≤ 100 MB)
 *   productId  — optioneel: koppel aan een product (uuid)
 *   tags       — optioneel: komma-gescheiden tags
 *   Alleen bij precies één videobestand (browser-metadata, zie asset-toolbar):
 *   duration   — duur in seconden
 *   videoWidth / videoHeight — afmetingen in pixels
 *   thumbnail  — posterframe (JPEG uit canvas)
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { isVideoContentType } from "@/lib/marketing/video";

import { emptySummary, ingestFromBytes, ingestVideoFromBytes, tally } from "../_ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fieldsSchema = z.object({
  productId: z.uuid().nullable(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  if ((session.user as { role?: string }).role === "viewer") {
    return NextResponse.json(
      { error: "Alleen-lezen account: uploaden is niet toegestaan voor de rol 'viewer'." },
      { status: 403 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "Verwacht multipart/form-data met een 'file'-veld." },
      { status: 400 },
    );
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Geen bestand meegestuurd." }, { status: 400 });
  }

  const parsed = fieldsSchema.safeParse({
    productId: (form.get("productId") as string | null) || null,
    tags: ((form.get("tags") as string | null) ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ongeldig productId (uuid verwacht) of ongeldige tags." },
      { status: 400 },
    );
  }

  // Browser-metadata voor video (alleen betrouwbaar bij precies één video).
  const videoCount = files.filter((f) => isVideoContentType(f.type)).length;
  const numField = (name: string): number | null => {
    const raw = form.get(name);
    const n = typeof raw === "string" && raw !== "" ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const thumbnailFile = form.get("thumbnail");
  const videoMeta =
    videoCount === 1
      ? {
          durationSeconds: numField("duration"),
          width: numField("videoWidth"),
          height: numField("videoHeight"),
          thumbnail:
            thumbnailFile instanceof File && thumbnailFile.size > 0
              ? {
                  bytes: new Uint8Array(await thumbnailFile.arrayBuffer()),
                  contentType: thumbnailFile.type || "image/jpeg",
                }
              : null,
        }
      : { durationSeconds: null, width: null, height: null, thumbnail: null };

  const summary = emptySummary();
  const results: Array<{ file: string; status: string; assetId?: string }> = [];
  // Sequentieel: de duplicaatdetectie moet elk vorig bestand al kennen.
  for (const file of files) {
    try {
      const result = isVideoContentType(file.type)
        ? await ingestVideoFromBytes({
            bytes: new Uint8Array(await file.arrayBuffer()),
            contentType: file.type,
            sourceRef: file.name,
            productId: parsed.data.productId,
            tags: parsed.data.tags,
            ...videoMeta,
          })
        : await ingestFromBytes({
            bytes: new Uint8Array(await file.arrayBuffer()),
            contentType: file.type,
            source: "upload",
            sourceRef: file.name,
            productId: parsed.data.productId,
            tags: parsed.data.tags,
          });
      tally(summary, result);
      results.push({ file: file.name, status: result.status, assetId: result.assetId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${file.name}: ${message}`);
      results.push({ file: file.name, status: "error" });
    }
  }

  return NextResponse.json(
    { ok: summary.errors.length === 0, ...summary, results },
    { status: summary.errors.length === 0 ? 200 : 207 },
  );
}
