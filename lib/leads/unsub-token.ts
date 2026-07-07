/**
 * Ondertekende afmeldtoken op basis van het e-mailadres — voor ontvangers zonder
 * eigen rij met een opgeslagen token (bestaande klanten/contacten). Formaat:
 * `c.<base64url(email)>.<hmac16>`. Zo kan de afmeldroute het adres verifiëren en
 * op de suppressielijst zetten zonder database-lookup vooraf.
 */
import { createHmac } from "node:crypto";

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "habitat-one-unsub-fallback";
}

export function signEmailToken(email: string): string {
  const e = email.trim().toLowerCase();
  const b = Buffer.from(e).toString("base64url");
  const sig = createHmac("sha256", secret()).update(e).digest("base64url").slice(0, 16);
  return `c.${b}.${sig}`;
}

/** Verifieer een `c.`-token → e-mailadres, of null als ongeldig. */
export function verifyEmailToken(token: string): string | null {
  if (!token.startsWith("c.")) return null;
  const [, b, sig] = token.split(".");
  if (!b || !sig) return null;
  let email: string;
  try {
    email = Buffer.from(b, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expect = createHmac("sha256", secret()).update(email).digest("base64url").slice(0, 16);
  return sig === expect ? email : null;
}
