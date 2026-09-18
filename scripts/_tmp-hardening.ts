import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
const run = async (label: string, st: any) => { try { await db.execute(st); console.log('ok  ', label); } catch (e) { console.log('FOUT', label, String((e as Error).message).split('\n').find((l)=>/error|denied|permission/i.test(l))?.slice(0,100)); } };
async function main() {
  // Alle apps praten server-side via DATABASE_URL of de service-role-key; de API-rollen anon/authenticated
  // hebben niets in het public-schema te zoeken. RLS blokkeerde al, dit haalt ook de grants weg (dubbele laag).
  await run('revoke all privilege', sql`revoke all privileges on all tables in schema public from anon, authenticated`);
  await run('revoke all privilege', sql`revoke all privileges on all sequences in schema public from anon, authenticated`);
  await run('revoke all privilege', sql`revoke all privileges on all functions in schema public from anon, authenticated`);
  await run('alter default privil', sql`alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated`);
  await run('alter default privil', sql`alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated`);
  await run('alter default privil', sql`alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated`);
  const r = await db.execute(sql`select grantee, count(*) n from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role') group by 1 order by 1`);
  console.log("grants public nu:", JSON.stringify(r));
  process.exit(0);
}
main();
