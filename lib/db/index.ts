import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString && process.env.NEXT_PHASE !== "phase-production-build") {
  // Don't throw at import time — `next build` loads this module while collecting
  // page data, and our pages are all dynamic so they never actually query.
  // Queries against the placeholder URL below will fail with a connection error.
  console.warn(
    "[habitat-crm] DATABASE_URL is not set — database access will fail. See .env.example.",
  );
}

// Reuse the underlying client across hot reloads / instance re-evals so we don't
// exhaust connections. For serverless behind Supabase's transaction pooler
// (port 6543) you want a *small* per-instance pool — the pooler does the real
// multiplexing — so we cap it at a few connections and let idle ones drop fast.
const globalForDb = globalThis as unknown as {
  __habitatPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__habitatPg ??
  postgres(connectionString ?? "postgres://localhost:5432/habitat_crm_unconfigured", {
    // `prepare: false` is required for Supabase's transaction pooler (6543).
    // We deliberately leave `max` at the postgres.js default — capping it lower
    // caused query queues that hit Postgres's statement_timeout under load.
    prepare: false,
    idle_timeout: 10,
    connect_timeout: 15,
  });

globalForDb.__habitatPg = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export const pgClient = client;
export { schema };
export * from "./schema";
