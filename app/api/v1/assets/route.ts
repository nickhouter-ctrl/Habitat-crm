import { and, arrayContains, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { apiAuth, apiError, apiJson, paging } from "@/lib/api-keys";
import { marketingStorage } from "@/lib/marketing/storage";
import { isVideoContentType } from "@/lib/marketing/video";
import { emptySummary, ingestFromBytes, ingestVideoFromBytes, tally } from "@/app/api/assets/_ingest";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Beeld- en videobibliotheek met publieke URL's. */
export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  const url = new URL(req.url), { limit, offset } = paging(url);
  const productId = url.searchParams.get("productId"), tag = url.searchParams.get("tag")?.trim();
  const mediaType = url.searchParams.get("mediaType"), source = url.searchParams.get("source");
  if (productId && !z.uuid().safeParse(productId).success) return apiError(400, "productId must be a uuid.");
  const where = and(productId ? eq(assets.productId, productId) : undefined, tag ? arrayContains(assets.tags, [tag]) : undefined,
    mediaType === "image" || mediaType === "video" ? eq(assets.mediaType, mediaType) : undefined,
    source === "website" || source === "instagram" || source === "upload" || source === "generated" ? eq(assets.source, source) : undefined);
  const rows = await db.select().from(assets).where(where).orderBy(desc(assets.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(assets).where(where);
  const storage = marketingStorage();
  return apiJson({ total, limit, offset, data: rows.map((a) => ({
    id: a.id, mediaType: a.mediaType, source: a.source, url: storage.publicUrl(a.storagePath),
    thumbnailUrl: a.thumbnailPath ? storage.publicUrl(a.thumbnailPath) : null, width: a.width, height: a.height,
    durationSeconds: a.durationSeconds == null ? null : Number(a.durationSeconds), dominantColors: a.dominantColors,
    productId: a.productId, tags: a.tags ?? [], igMetrics: a.igMetrics, createdAt: a.createdAt })) });
}

/** Upload naar de bibliotheek: dezelfde pijplijn als in het CRM (afmetingen, duplicaten, kleuren). */
export async function POST(req: Request) {
  const caller = await apiAuth(req, "content:write");
  if (caller instanceof Response) return caller;
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "Expected multipart/form-data with a 'file' field.");
  const files = form.getAll("file").filter((f): f is File => f instanceof File).slice(0, 10);
  if (!files.length) return apiError(400, "No file sent.");
  const fields = z.object({ productId: z.uuid().nullable(), tags: z.array(z.string().trim().min(1).max(60)).max(20) }).safeParse({
    productId: (form.get("productId") as string | null) || null,
    tags: ["api", ...((form.get("tags") as string | null) ?? "").split(",").map((t) => t.trim()).filter(Boolean)],
  });
  if (!fields.success) return apiError(400, "Invalid productId (uuid) or tags.");
  const summary = emptySummary(), results: { file: string; status: string; assetId?: string }[] = [];
  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = isVideoContentType(file.type)
        ? await ingestVideoFromBytes({ bytes, contentType: file.type, sourceRef: `api:${caller.name}:${file.name}`, productId: fields.data.productId, tags: fields.data.tags, durationSeconds: null, width: null, height: null, thumbnail: null })
        : await ingestFromBytes({ bytes, contentType: file.type, source: "upload", sourceRef: `api:${caller.name}:${file.name}`, productId: fields.data.productId, tags: fields.data.tags });
      tally(summary, result); results.push({ file: file.name, status: result.status, assetId: result.assetId });
    } catch (err) {
      summary.errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`); results.push({ file: file.name, status: "error" });
    }
  }
  return apiJson({ ok: summary.errors.length === 0, ...summary, results }, summary.errors.length ? 207 : 201);
}
