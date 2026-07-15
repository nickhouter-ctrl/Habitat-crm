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
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
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
      returning "count"
    `)) as unknown as Array<{ count: number }>;
    const count = Number(rows?.[0]?.count ?? 0);
    return count <= max;
  } catch (err) {
    console.warn("[rate-limit] check mislukt (fail-open):", err);
    return true;
  }
}

/** Client-IP uit de proxy-headers (Vercel zet x-forwarded-for betrouwbaar). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "onbekend";
}

/** Standaard 429-body voor JSON-endpoints. */
export const RATE_LIMITED = { ok: false, error: "too-many-requests" } as const;
