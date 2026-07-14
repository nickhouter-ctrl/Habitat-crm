/**
 * DDL voor het zzp-urenportaal (drizzle-kit push crasht op deze DB — zie
 * eerdere apply-*.ts scripts):
 *  - worker_portal_links: één link per arbeider PER PROJECT
 *  - time_entries.self_logged_at (portaal-invoer herkenbaar)
 *  - workers.portal_lang (taal van het portaal per arbeider)
 *  - workers.portal_token vervallen (vervangen door worker_portal_links)
 *
 * Draai:  npx tsx scripts/apply-worker-portal.ts
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

async function main() {
  await db.execute(
    sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS self_logged_at timestamp with time zone`,
  );
  await db.execute(
    sql`ALTER TABLE workers ADD COLUMN IF NOT EXISTS portal_lang text NOT NULL DEFAULT 'es'`,
  );
  await db.execute(
    sql`ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone`,
  );
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS worker_portal_links (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      token text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS worker_portal_links_token_idx ON worker_portal_links (token)`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS worker_portal_links_worker_project_idx ON worker_portal_links (worker_id, project_id)`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS worker_portal_links_project_idx ON worker_portal_links (project_id)`,
  );
  // Oude algemene per-worker token vervallen.
  await db.execute(sql`DROP INDEX IF EXISTS workers_portal_token_idx`);
  await db.execute(sql`ALTER TABLE workers DROP COLUMN IF EXISTS portal_token`);
  console.log("worker-portal DDL aangebracht (per-project links)");
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
