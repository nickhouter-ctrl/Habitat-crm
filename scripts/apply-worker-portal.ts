/**
 * DDL voor het zzp-urenportaal (drizzle-kit push crasht op deze DB — zie
 * eerdere apply-*.ts scripts): workers.portal_token + time_entries.self_logged_at.
 *
 * Draai:  npx tsx scripts/apply-worker-portal.ts
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  await db.execute(sql`ALTER TABLE workers ADD COLUMN IF NOT EXISTS portal_token text`);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS workers_portal_token_idx ON workers (portal_token)`,
  );
  await db.execute(
    sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS self_logged_at timestamp with time zone`,
  );
  console.log("worker-portal kolommen aangebracht");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
