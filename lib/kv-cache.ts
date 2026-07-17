/**
 * Mini key-value-cache op Postgres — gedeeld over alle serverless-instances.
 * Voor kleine, dure externe resultaten (bv. Holded-boekhoudcijfers) die
 * minutenlang houdbaar zijn. Faalt stil (null) bij databasefouten.
 */
import "server-only";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const rows = (await db.execute(
      sql`select value from kv_cache where "key" = ${key}`,
    )) as unknown as Array<{ value: T }>;
    return rows?.[0]?.value ?? null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await db.execute(sql`
      insert into kv_cache ("key", value, updated_at)
      values (${key}, ${JSON.stringify(value)}::jsonb, now())
      on conflict ("key") do update set value = excluded.value, updated_at = now()
    `);
  } catch {
    /* cache-schrijffout is nooit fataal */
  }
}

/**
 * Promise met harde timeout waarvan de timer wordt OPGERUIMD zodra de echte
 * promise wint — een achterblijvende setTimeout kan op Vercel de response
 * openhouden.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
