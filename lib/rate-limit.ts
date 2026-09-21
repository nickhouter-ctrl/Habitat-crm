/**
 * Eenvoudige rate limiter op Postgres (vaste vensters) — geen extra infra en
 * werkt over alle serverless-instances heen. Gebruik voor PUBLIEKE endpoints
 * (portal-login, registraties, offerte-aanvragen) tegen brute force en
 * mail-spam. Faalt OPEN bij een databasefout: liever geen limiet dan een
 * klant buitensluiten door een storing.
 */
import "server-only";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * Tel een hit voor `key` en geef terug of die nog binnen de limiet valt.
 * Vast venster: na `windowSec` zonder reset start de teller opnieuw.
 */
/**
 * `strikt: true` = fail-closed: kan de teller niet bijgewerkt worden (database
 * onbereikbaar), dan weigeren we. Gebruik dat op inlog- en tokenpaden; op
 * gewone formulieren blijft de oude fail-open, zodat een storing geen klanten
 * buitensluit.
 */
export async function rateLimit(key: string, max: number, windowSec: number, opties: { strikt?: boolean } = {}): Promise<boolean> {
  return (await rateLimitDetail(key, max, windowSec, opties)).ok;
}

export interface RateLimitStand {
  ok: boolean;
  /** Hoeveel seconden nog te gaan tot het venster opnieuw begint (0 = vrij). */
  wachtSec: number;
}

/**
 * Zelfde teller, maar met de wachttijd erbij.
 *
 * Nodig omdat "te veel pogingen" en "verkeerd wachtwoord" voor de gebruiker
 * twee verschillende dingen zijn. Het inlogscherm meldde bij een geblokkeerde
 * teller "onjuist e-mailadres of wachtwoord", en dan blijft iemand het met een
 * goed wachtwoord proberen — wat de teller alleen verder oploopt. Teresa zat er
 * vandaag op 11 pogingen mee vast.
 */
export async function rateLimitDetail(
  key: string,
  max: number,
  windowSec: number,
  opties: { strikt?: boolean } = {},
): Promise<RateLimitStand> {
  try {
    const rows = (await db.execute(sql`
      insert into rate_limits ("key", window_start, "count")
      values (${key}, now(), 1)
      on conflict ("key") do update set
        "count" = case
          when rate_limits.window_start < now() - make_interval(secs => ${windowSec})
            then 1
          else rate_limits."count" + 1
        end,
        window_start = case
          when rate_limits.window_start < now() - make_interval(secs => ${windowSec})
            then now()
          else rate_limits.window_start
        end
      returning "count", greatest(0, ceil(extract(epoch from (window_start + make_interval(secs => ${windowSec})) - now())))::int as wacht
    `)) as unknown as Array<{ count: number; wacht: number }>;
    const count = Number(rows?.[0]?.count ?? 0);
    const ok = count <= max;
    return { ok, wachtSec: ok ? 0 : Number(rows?.[0]?.wacht ?? windowSec) };
  } catch (err) {
    console.warn(`[rate-limit] check mislukt (${opties.strikt ? "fail-closed" : "fail-open"}):`, err);
    return { ok: !opties.strikt, wachtSec: opties.strikt ? windowSec : 0 };
  }
}

/** Client-IP uit de proxy-headers (Vercel zet x-forwarded-for betrouwbaar). */
export function clientIp(req: Request): string {
  return clientIpFromHeaders(req.headers);
}

/**
 * Zelfde logica, maar vanaf losse headers — een server action heeft `headers()`,
 * geen `Request`.
 */
export function clientIpFromHeaders(h: Headers): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "onbekend";
}

/** Standaard 429-body voor JSON-endpoints. */
export const RATE_LIMITED = { ok: false, error: "too-many-requests" } as const;
