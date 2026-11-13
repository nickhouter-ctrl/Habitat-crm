import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { brands } from "@/lib/db/schema";
import { apiAuth, apiJson } from "@/lib/api-keys";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const caller = await apiAuth(req, "content:read");
  if (caller instanceof Response) return caller;
  const data = await db.select({ id: brands.id, name: brands.name, slug: brands.slug, logoUrl: brands.logoUrl, websiteUrl: brands.websiteUrl }).from(brands).orderBy(asc(brands.name));
  return apiJson({ total: data.length, data });
}
