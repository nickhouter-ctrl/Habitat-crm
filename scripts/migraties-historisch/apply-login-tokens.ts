/**
 * Inloglinks voor in de mail: één klik in plaats van je wachtwoord opzoeken.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`
    create table if not exists login_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      token text not null unique,
      /** Waar de link vandaan kwam, puur om te kunnen nazoeken. */
      purpose text,
      expires_at timestamptz not null,
      last_used_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`);
  await db.execute(sql`create index if not exists login_tokens_user_idx on login_tokens (user_id)`);
  // Zelfde regel als de rest van de database: niets via de PostgREST-API.
  await db.execute(sql`alter table login_tokens enable row level security`);
  const [t] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.tables where table_name = 'login_tokens'`);
  console.log(`OK: login_tokens (${t.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
