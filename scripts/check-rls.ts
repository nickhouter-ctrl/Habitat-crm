import "./load-env";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

async function main() {
  const who = await sql`select current_user`;
  console.log("verbonden als:", who[0].current_user);
  const t = await sql`
    select c.relname as tabel, c.relrowsecurity as rls, pg_get_userbyid(c.relowner) as eigenaar,
           (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relrowsecurity asc, c.relname`;
  const off = t.filter((r) => !r.rls);
  console.log(`tabellen: ${t.length} | RLS UIT: ${off.length} | RLS aan: ${t.length - off.length}`);
  console.log("\nRLS UIT:");
  for (const r of off) console.log("  ", String(r.tabel).padEnd(30), "eigenaar:", r.eigenaar, "policies:", r.policies);
  await sql.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
