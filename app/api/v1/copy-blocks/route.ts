import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { copyBlocks } from "@/lib/db/schema";
import { apiAuth, apiError, apiJson, paging } from "@/lib/api-keys";
export const dynamic = "force-dynamic";

const locale = z.enum(["en", "nl", "es", "de"]), role = z.enum(["eyebrow", "headline", "subline", "cta"]);
export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  const url = new URL(req.url), { limit, offset } = paging(url);
  const l = locale.safeParse(url.searchParams.get("locale")), r = role.safeParse(url.searchParams.get("role"));
  const productId = url.searchParams.get("productId");
  if (productId && !z.uuid().safeParse(productId).success) return apiError(400, "productId must be a uuid.");
  const where = and(l.success ? eq(copyBlocks.locale, l.data) : undefined, r.success ? eq(copyBlocks.role, r.data) : undefined, productId ? eq(copyBlocks.productId, productId) : undefined);
  const data = await db.select({ id: copyBlocks.id, angle: copyBlocks.angle, locale: copyBlocks.locale, role: copyBlocks.role, text: copyBlocks.text, productId: copyBlocks.productId })
    .from(copyBlocks).where(where).orderBy(desc(copyBlocks.createdAt)).limit(limit).offset(offset);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(copyBlocks).where(where);
  return apiJson({ total, limit, offset, data });
}
const body = z.object({ angle: z.enum(["material", "price", "showroom", "project", "seasonal"]), locale, role, text: z.string().trim().min(1).max(500), productId: z.uuid().nullish() });
export async function POST(req: Request) {
  const caller = await apiAuth(req, "content:write");
  if (caller instanceof Response) return caller;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const [row] = await db.insert(copyBlocks).values({ ...parsed.data, productId: parsed.data.productId ?? null, pattern: `api:${caller.name}` }).returning({ id: copyBlocks.id });
  return apiJson(row, 201);
}
