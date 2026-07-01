import { NextResponse } from "next/server";

import { verifyPortalToken, type PortalToken } from "./token";

/** CORS: sta habitat-one + vercel-previews + lokale dev toe. */
export function portalCors(origin?: string | null): HeadersInit {
  const allow = origin && /habitat-one|vercel\.app|localhost|127\.0\.0\.1/i.test(origin) ? origin : "*";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-credentials": "true",
    vary: "origin",
  };
}

/** Leest de portal-token uit de Authorization: Bearer header (of ?token=). */
export function portalAuth(req: Request): PortalToken | null {
  const h = req.headers.get("authorization");
  let token = h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
  if (!token) token = new URL(req.url).searchParams.get("token");
  return verifyPortalToken(token);
}

export function jsonCors(body: unknown, init: number | ResponseInit, origin?: string | null) {
  const base = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(body, { ...base, headers: { ...portalCors(origin), ...(base.headers ?? {}) } });
}

/** Tier-prijs (ex. btw): particulier → priceEur, aannemer → tradePriceEur (fallback priceEur). */
export function tierPrice(
  tier: "particulier" | "aannemer",
  priceEur: string | number | null,
  tradePriceEur: string | number | null,
): number | null {
  const p = priceEur != null && priceEur !== "" ? Number(priceEur) : null;
  const t = tradePriceEur != null && tradePriceEur !== "" ? Number(tradePriceEur) : null;
  const val = tier === "aannemer" ? (t ?? p) : p;
  return val != null && Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
}
