import "./load-env";
import { db, pgClient } from "../lib/db";
import { sql } from "drizzle-orm";
(async()=>{
  const tablesRes = await db.execute(sql`select tablename from pg_tables where schemaname='public' order by tablename`);
  const tables: string[] = ((tablesRes as any).rows ?? tablesRes).map((r:any)=>r.tablename);
  console.log("Public-tabellen:", tables.join(", "));
  for (const t of tables) {
    // identifier is from pg_tables (trusted); quote it anyway.
    await db.execute(sql.raw(`ALTER TABLE public."${t}" ENABLE ROW LEVEL SECURITY;`));
    // Belt & braces: make sure RLS is also forced for the owner is NOT needed (our app connects as owner and should keep full access).
    console.log("  ✓ RLS aan:", t);
  }
  // verify
  const v = await db.execute(sql`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`);
  console.log("\nStatus:");
  for (const r of ((v as any).rows ?? v)) console.log("  ", r.relname, "rls=", r.relrowsecurity);
  await pgClient.end();
  process.exit(0);
})().catch(async e=>{console.error(e); try{await pgClient.end();}catch{} process.exit(1);});
