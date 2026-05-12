import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
(async()=>{
  try {
    const act = await db.execute(sql`select pid, state, wait_event_type, wait_event, now()-query_start as dur, left(query,120) as q from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() order by query_start nulls last`);
    console.log("=== pg_stat_activity ===");
    for (const r of (act as unknown as { rows?: any[] }).rows ?? (act as any)) console.log(JSON.stringify(r));
  } catch(e){ console.log("activity query err:", e instanceof Error?e.message:e); }
  try {
    const locks = await db.execute(sql`select relation::regclass as rel, mode, granted, pid from pg_locks where relation is not null and relation::regclass::text like '%purchase%' or relation::regclass::text like '%product%'`);
    console.log("=== relevant locks ===");
    for (const r of (locks as unknown as { rows?: any[] }).rows ?? (locks as any)) console.log(JSON.stringify(r));
  } catch(e){ console.log("locks query err:", e instanceof Error?e.message:e); }
  try { const t=await db.execute(sql`show statement_timeout`); console.log("statement_timeout:", JSON.stringify((t as any).rows ?? t)); } catch(e){console.log("st err",e instanceof Error?e.message:e);}
  // simple timed query
  const t0=Date.now(); try { await db.execute(sql`select count(*) from purchase_orders`); console.log("count(purchase_orders):", Date.now()-t0,"ms"); } catch(e){console.log("count err:", Date.now()-t0,"ms", e instanceof Error?e.message:e);}
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
