/** DDL voor lib/rate-limit.ts.  Draai: npx tsx scripts/apply-rate-limits.ts */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      "key" text PRIMARY KEY,
      window_start timestamp with time zone NOT NULL DEFAULT now(),
      "count" integer NOT NULL DEFAULT 1
    )
  `);
  console.log("rate_limits tabel aangebracht");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
