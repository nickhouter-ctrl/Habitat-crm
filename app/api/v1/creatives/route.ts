import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { assets, creativeSpecs } from "@/lib/db/schema";
import { apiAuth, apiError, apiJson, paging } from "@/lib/api-keys";
export const dynamic = "force-dynamic";

const STATUS = ["draft", "approved", "scheduled", "live", "archived"] as const;
export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  const url = new URL(req.url), { limit, offset } = paging(url);
  const status = url.searchParams.get("status"), productId = url.searchParams.get("productId");
  if (productId && !z.uuid().safeParse(productId).success) return apiError(400, "productId must be a uuid.");
  const where = and(STATUS.includes(status as never) ? eq(creativeSpecs.status, status as (typeof STATUS)[number]) : undefined, productId ? eq(creativeSpecs.productId, productId) : undefined);
  const data = await db.select({ id: creativeSpecs.id, status: creativeSpecs.status, productId: creativeSpecs.productId, assetId: creativeSpecs.assetId,
    template: creativeSpecs.template, palette: creativeSpecs.palette, format: creativeSpecs.format, locale: creativeSpecs.locale, copy: creativeSpecs.copy,
    copyAngle: creativeSpecs.copyAngle, suggestedMessage: creativeSpecs.suggestedMessage, createdBy: creativeSpecs.createdBy, createdAt: creativeSpecs.createdAt })
    .from(creativeSpecs).where(where).orderBy(desc(creativeSpecs.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(creativeSpecs).where(where);
  return apiJson({ total, limit, offset, data });
}

const body = z.object({
  assetId: z.uuid(), productId: z.uuid().nullish(), template: z.string().trim().min(1).max(60), palette: z.string().trim().min(1).max(60),
  format: z.enum(["1080x1080", "1080x1350", "1080x1920"]), locale: z.enum(["en", "nl", "es", "de"]),
  copy: z.object({ headline: z.string().trim().min(1).max(200), eyebrow: z.string().trim().max(100).optional(), subline: z.string().trim().max(300).optional(),
    cta: z.string().trim().max(60).optional(), badge: z.string().trim().max(40).optional() }),
  copyAngle: z.enum(["material", "price", "showroom", "project", "seasonal"]).nullish(), suggestedMessage: z.string().trim().max(2000).nullish(),
});
/** Nieuwe creative, altijd als concept: goedkeuren en publiceren gebeurt in het CRM. */
export async function POST(req: Request) {
  const caller = await apiAuth(req, "content:write");
  if (caller instanceof Response) return caller;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const d = parsed.data;
  const [asset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, d.assetId));
  if (!asset) return apiError(404, "assetId not found. Upload it first via POST /api/v1/assets.");
  const [row] = await db.insert(creativeSpecs).values({ assetId: d.assetId, productId: d.productId ?? null, template: d.template, palette: d.palette,
    format: d.format, locale: d.locale, copy: d.copy, copyAngle: d.copyAngle ?? null, suggestedMessage: d.suggestedMessage ?? null,
    status: "draft", createdBy: `api:${caller.name}` }).returning({ id: creativeSpecs.id, status: creativeSpecs.status });
  return apiJson(row, 201);
}
