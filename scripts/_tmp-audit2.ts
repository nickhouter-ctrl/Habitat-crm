import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function q(label: string, s: ReturnType<typeof sql>) { try { const r = await db.execute(s); console.log(`\n== ${label} (${r.length})`); for (const x of (r as any[]).slice(0, 12)) console.log(JSON.stringify(x)); } catch (e) { console.log(`\n== ${label}: FOUT ${(e as Error).message.slice(0, 100)}`); } }
async function main() {
  await q("RLS windows-schema", sql`select relrowsecurity rls, count(*) n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='windows' and c.relkind='r' group by 1`);
  await q("grants anon/authenticated windows", sql`select grantee, count(*) from information_schema.role_table_grants where table_schema='windows' and grantee in ('anon','authenticated') group by 1`);
  await q("usage-grants op schema's", sql`select nspname, has_schema_privilege('anon', nspname, 'USAGE') anon_usage, has_schema_privilege('authenticated', nspname, 'USAGE') auth_usage from pg_namespace where nspname in ('public','windows','storage')`);
  await q("gebruikerstabellen", sql`select table_name from information_schema.tables where table_schema='public' and table_name ~* 'user|account|session|token|portal' order by 1`);
  await q("wachtwoordhash-vorm", sql`select left(password_hash, 7) vorm, count(*) from public.crm_users group by 1`);
  await q("windows-files paden", sql`select name, (metadata->>'size')::int size from storage.objects where bucket_id='windows-files'`);
  await q("catalogs paden", sql`select name from storage.objects where bucket_id='catalogs'`);
  await q("purchase-order-files voorbeeld", sql`select name from storage.objects where bucket_id='purchase-order-files' limit 3`);
  await q("email-attachments voorbeeld", sql`select name from storage.objects where bucket_id='email-attachments' limit 2`);
  await q("marketing-assets voorbeeld", sql`select name from storage.objects where bucket_id='marketing-assets' limit 3`);
  await q("product-images per map", sql`select split_part(name,'/',1) map, count(*) n, round(sum((metadata->>'size')::bigint)/1048576.0) mb from storage.objects where bucket_id='product-images' group by 1 order by 3 desc limit 8`);
  process.exit(0);
}
main();
