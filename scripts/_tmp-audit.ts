import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function q(label: string, s: ReturnType<typeof sql>) { try { const r = await db.execute(s); console.log(`\n== ${label} (${r.length})`); for (const x of r as any[]) console.log(JSON.stringify(x)); } catch (e) { console.log(`\n== ${label}: FOUT ${(e as Error).message.slice(0, 120)}`); } }
async function main() {
  await q("schema's", sql`select nspname, (select count(*) from pg_class c where c.relnamespace=n.oid and c.relkind='r') tabellen from pg_namespace n where nspname not like 'pg_%' and nspname not in ('information_schema') order by 1`);
  await q("RLS-status public (uit = open voor anon/authenticated als er grants zijn)", sql`select relrowsecurity rls, count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' group by 1`);
  await q("grants aan anon/authenticated op public-tabellen", sql`select grantee, privilege_type, count(*) n from information_schema.role_table_grants where table_schema in ('public','windows') and grantee in ('anon','authenticated') group by 1,2 order by 1,2`);
  await q("policies", sql`select schemaname, count(*) n from pg_policies group by 1`);
  await q("storage buckets", sql`select id, public, file_size_limit, allowed_mime_types, created_at::date from storage.buckets order by 1`);
  await q("storage policies", sql`select policyname, cmd, roles::text, qual from pg_policies where schemaname='storage' order by 1`);
  await q("storage objecten per bucket", sql`select bucket_id, count(*) n, round(sum((metadata->>'size')::bigint)/1048576.0) mb from storage.objects group by 1 order by 1`);
  await q("auth-gebruikers (Supabase auth)", sql`select count(*) n from auth.users`);
  await q("CRM-gebruikers (Auth.js)", sql`select count(*) n, count(*) filter (where password is not null) met_wachtwoord from users`);
  await q("db-rollen met login", sql`select rolname, rolsuper, rolbypassrls from pg_roles where rolcanlogin order by 1`);
  await q("extensies", sql`select extname from pg_extension order by 1`);
  await q("db-grootte", sql`select pg_size_pretty(pg_database_size(current_database())) grootte`);
  await q("pg-versie", sql`select version()`);
  await q("windows-schema tabellen", sql`select count(*) n from pg_tables where schemaname='windows'`);
  process.exit(0);
}
main();
