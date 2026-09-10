/**
 * Doorgeefcode voor "één login" website → projectportaal.
 *
 * De website stuurt (server-side) het portal-sessietoken in de Authorization-
 * header; wij geven een eenmalige code terug die 60 seconden geldig is. Alleen
 * die korte code gaat in de redirect-URL naar /klant/login-via-website — het
 * echte token van 30 dagen komt zo nooit in URL's, logs of browsergeschiedenis.
 */
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { jsonCors, portalAuth, portalCors } from "@/lib/portal/api";
import { signPortalToken } from "@/lib/portal/token";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const GELDIG_SECONDEN = 60;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: portalCors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const payload = portalAuth(req);
  if (!payload) return jsonCors({ ok: false, error: "unauthorized" }, 401, origin);
  if (!(await rateLimit(`portal-handoff:ip:${clientIp(req)}`, 30, 300, { strikt: true }))) {
    return jsonCors({ ok: false, error: "too-many-requests" }, 429, origin);
  }
  const code = randomBytes(24).toString("base64url");
  // Eén rij in rate_limits als "nog niet gebruikt"-vlag; de login-route wist hem bij gebruik.
  await db.execute(sql`insert into rate_limits ("key", window_start, "count") values (${`handoff:${code}`}, now(), 0)`);
  // De claims zelf reizen in een kort ondertekend token mee (zelfde HMAC als het sessietoken).
  const kort = signPortalToken({ sub: payload.sub, email: payload.email, tier: payload.tier, contactId: payload.contactId, exp: Math.floor(Date.now() / 1000) + GELDIG_SECONDEN });
  return jsonCors({ ok: true, code: `${code}.${kort}`, expiresIn: GELDIG_SECONDEN }, 200, origin);
}
