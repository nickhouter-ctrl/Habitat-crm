import { NextResponse } from "next/server";

import { verifyPortalToken, type PortalToken } from "./token";

/** CORS: sta alleen onze eigen domeinen + lokale dev toe (exacte host-check —
 * een substring-regex liet ook bv. habitat-one.evil.com en elk *.vercel.app door). */
export function portalCors(origin?: string | null): HeadersInit {
  let allow = "*";
  if (origin) {
    try {
      const host = new URL(origin).hostname.toLowerCase();
      const ok =
        host === "habitat-one.com" ||
        host.endsWith(".habitat-one.com") ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        // Eigen Vercel-previews (projectnaam-prefix), niet elk *.vercel.app.
        (host.endsWith(".vercel.app") && /^habitat[a-z0-9-]*-nickhouter/.test(host));
      if (ok) allow = origin;
    } catch {
      /* ongeldige origin → geen reflectie */
    }
  }
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
