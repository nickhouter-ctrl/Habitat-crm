import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { rateLimitDetail } from "@/lib/rate-limit";

export type ApiScope = "content:read" | "content:write";
export const hashApiKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Nieuwe sleutel: "hab_" + 40 tekens. Alleen de hash wordt bewaard. */
export function newApiKey() {
  const key = `hab_${randomBytes(30).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: `${key.slice(0, 10)}…` };
}

export type ApiCaller = { id: string; name: string; scopes: string[] };

/**
 * Controleer de sleutel uit `Authorization: Bearer hab_…` (of `X-API-Key`).
 * Geeft de beller terug, of een kant-en-klaar foutantwoord.
 */
export async function apiAuth(req: Request, scope: ApiScope): Promise<ApiCaller | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : (req.headers.get("x-api-key") ?? "").trim();
  if (!/^hab_[A-Za-z0-9_-]{30,60}$/.test(key)) return apiError(401, "Missing or invalid API key. Send it as: Authorization: Bearer hab_…");
  const [row] = await db.select({ id: apiKeys.id, name: apiKeys.name, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys).where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)));
  if (!row) return apiError(401, "Unknown or revoked API key.");
  if (!row.scopes.includes(scope)) return apiError(403, `This key has no ${scope} permission.`);
  const limit = await rateLimitDetail(`api-v1:${row.id}`, 120, 60);
  if (!limit.ok) return apiError(429, "Too many requests: max 120 per minute.");
  // Laatst gebruikt bijhouden, hooguit eens per minuut schrijven.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000)
    await db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, row.id)).catch(() => {});
  return { id: row.id, name: row.name, scopes: row.scopes };
}

export function apiError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}
/** limit/offset uit de querystring, begrensd. */
export function paging(url: URL, max = 100) {
  const limit = Math.min(max, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  return { limit, offset };
}
