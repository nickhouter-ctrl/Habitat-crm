import "server-only";

import { NextResponse } from "next/server";

/**
 * Auth-check voor de Vercel-cron-routes. Fail-closed: zonder `CRON_SECRET`
 * in productie krijgt élke aanroep 503 — voorheen degradeerde de check naar
 * `Bearer undefined` en was de route de facto publiek. Lokaal (dev) blijft
 * de route open zodat je hem handmatig kunt hitten.
 *
 * Gebruik: `const denied = requireCron(req); if (denied) return denied;`
 */
export function requireCron(req: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron-secret-not-configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
