import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
(async()=>{
  // Terminate stale app/script connections (NOT Supabase-internal ones).
  const res = await db.execute(sql`
    select pg_terminate_backend(pid) as killed, pid, state, now()-state_change as idle_for, left(query,80) as q
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and application_name not ilike '%pgbouncer%'
      and (query ilike '%"purchase_orders"%' or query ilike '%"documents"%' or query ilike '%"products"%' or query ilike '%"contacts"%' or query ilike '%"deals"%' or query ilike '%"holded_sync_map"%')
      and state in ('idle','active')
      and (now()-state_change) > interval '90 seconds'
  `);
  const rows = (res as unknown as { rows?: any[] }).rows ?? (res as any);
  console.log("Getermineerde verbindingen:", Array.isArray(rows) ? rows.length : "?");
  for (const r of rows ?? []) console.log(JSON.stringify(r));
  // show what's left
  const left = await db.execute(sql`select count(*)::int as n from pg_stat_activity where datname=current_database()`);
  console.log("Verbindingen over:", JSON.stringify((left as any).rows ?? left));
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
