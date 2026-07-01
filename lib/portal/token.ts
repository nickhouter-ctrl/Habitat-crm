import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Compacte, ondertekende sessietoken voor het klantportal — gedeeld tussen de
 * CRM (ondertekent + verifieert) en de website habitat-one (verifieert). Geen
 * externe dependency: HMAC-SHA256 over een base64url-payload.
 *
 * Formaat: base64url(JSON) + "." + base64url(HMAC). Zet `PORTAL_JWT_SECRET` in
 * beide Vercel-projecten (zelfde waarde).
 */
const SECRET = process.env.PORTAL_JWT_SECRET ?? "";
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dagen

export type PortalToken = {
  sub: string; // customer_account id
  email: string;
  tier: "particulier" | "aannemer";
  contactId: string | null;
  exp: number; // unix seconds
};

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signPortalToken(payload: Omit<PortalToken, "exp"> & { exp?: number }): string {
  if (!SECRET) throw new Error("PORTAL_JWT_SECRET ontbreekt");
  const full: PortalToken = { ...payload, exp: payload.exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const body = b64url(Buffer.from(JSON.stringify(full)));
  const sig = b64url(createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

/** Verifieert handtekening + verloop; geeft de payload of null. */
export function verifyPortalToken(token: string | null | undefined): PortalToken | null {
  if (!token || !SECRET) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body).toString("utf8")) as PortalToken;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
