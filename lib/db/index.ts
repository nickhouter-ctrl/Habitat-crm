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

// Reuse the underlying client across hot reloads in dev so we don't exhaust
// connections. `prepare: false` + `max: 1` is the right shape for serverless on
// Supabase's transaction pooler (port 6543): each function instance keeps one
// connection, returned to the pool after every statement.
const globalForDb = globalThis as unknown as {
  __habitatPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__habitatPg ??
  postgres(connectionString ?? "postgres://localhost:5432/habitat_crm_unconfigured", {
    prepare: false,
    max: 1,
    idle_timeout: 20,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__habitatPg = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
export * from "./schema";
