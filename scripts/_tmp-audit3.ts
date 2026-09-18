import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
async function main() {
  const t = async (label: string, s: ReturnType<typeof sql>) => { try { const r = await db.execute(s); console.log(`${label}: TOEGANG (${(r as any[]).length} rijen / ${JSON.stringify((r as any[])[0] ?? {}).slice(0, 80)})`); } catch (e) { console.log(`${label}: geblokkeerd — ${(e as Error).message.split("\n").find((l) => /permission|denied|violates|policy/i.test(l))?.slice(0, 90) ?? (e as Error).message.slice(0, 90)}`); } };
  await db.execute(sql`set role anon`);
  await t("anon: select users", sql`select count(*) from public.users`);
  await t("anon: select customer_accounts", sql`select count(*) from public.customer_accounts`);
  await t("anon: select products", sql`select count(*) from public.products`);
  await t("anon: insert products", sql`insert into public.products (id, name) values (gen_random_uuid(), 'x')`);
  await t("anon: storage.objects lijst", sql`select count(*) from storage.objects`);
  await t("anon: storage.buckets", sql`select id from storage.buckets`);
  await t("anon: windows.orders", sql`select count(*) from windows.orders`);
  await db.execute(sql`reset role`);
  await db.execute(sql`set role authenticated`);
  await t("authenticated: select users", sql`select count(*) from public.users`);
  await db.execute(sql`reset role`);
  process.exit(0);
}
main();
