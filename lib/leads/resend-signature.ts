/**
 * De signatuur van een Resend-webhook controleren.
 *
 * Resend gebruikt Svix, en dat is bewust anders dan een geheim in de URL zoals
 * bij de Holded-webhook: hier komt de controle uit een HMAC over het id, het
 * tijdstip én de body. Een aanvaller die het geheim niet heeft, kan dus ook
 * geen geldig bericht namaken, en een oud bericht kan niet worden herhaald.
 *
 * Puur, dus testbaar op vaste voorbeelden.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Buiten deze marge accepteren we een bericht niet — tegen herhaalde verzoeken. */
export const MAX_AFWIJKING_SEC = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export type Uitkomst = { ok: true } | { ok: false; reden: string };

/**
 * `secret` is de "whsec_…"-waarde uit het Resend-dashboard. Het deel na het
 * voorvoegsel is base64.
 */
export function controleerSvix(secret: string, headers: SvixHeaders, ruweBody: string, nu = Date.now()): Uitkomst {
  if (!secret) return { ok: false, reden: "geen webhook-secret ingesteld" };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reden: "svix-headers ontbreken" };
  }

  const tijd = Number(headers.timestamp);
  if (!Number.isFinite(tijd)) return { ok: false, reden: "tijdstempel onleesbaar" };
  if (Math.abs(nu / 1000 - tijd) > MAX_AFWIJKING_SEC) {
    return { ok: false, reden: "tijdstempel te oud of te ver in de toekomst" };
  }

  const sleutel = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const eigen = createHmac("sha256", sleutel).update(`${headers.id}.${headers.timestamp}.${ruweBody}`).digest("base64");

  // De header kan meerdere signaturen bevatten ("v1,xxx v1,yyy") — bij het
  // wisselen van een geheim staan er even twee.
  for (const deel of headers.signature.split(" ")) {
    const [versie, waarde] = deel.split(",");
    if (versie !== "v1" || !waarde) continue;
    const a = Buffer.from(waarde);
    const b = Buffer.from(eigen);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true };
  }
  return { ok: false, reden: "signatuur klopt niet" };
}
