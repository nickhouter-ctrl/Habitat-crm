/**
 * Wat er van een levering nog besteld moet worden.
 *
 * Een product dat niet op voorraad ligt moet je toch aan de werf kunnen hangen —
 * het is beloofd aan de klant, het telt in de kosten en in wat je doorbelast.
 * Alleen ligt het er nog niet. Dan gaat er af wat er wél ligt en blijft de rest
 * staan als "nog te bestellen", zodat het op de bestellijst komt in plaats van
 * de levering te weigeren.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table project_deliveries add column if not exists to_order_qty numeric(14,3) not null default 0`);
  const [k] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from information_schema.columns
    where table_name='project_deliveries' and column_name='to_order_qty'`);
  console.log(`OK: project_deliveries.to_order_qty (${k.n})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
