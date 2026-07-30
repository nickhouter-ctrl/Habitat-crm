/**
 * Tarief met meer decimalen, zodat uren × tarief exact het factuurbedrag is.
 *
 * Waarom: bij een bouwfactuur met alleen een totaalbedrag rekent het systeem de
 * uren terug (€ 3.000 ÷ € 28 = 107,142857…). Uren gaan op 2 decimalen de
 * database in (107,14) en het tarief ook (28,00), dus de geboekte kost werd
 * € 2.999,92 — 8 cent minder dan de factuur. Geen enkel tarief van 2 decimalen
 * maakt dat sluitend (3000 ÷ 28 is een repeterende breuk), dus krijgt het tarief
 * 6 decimalen: 107,14 × 28,000747 = € 3.000,00 op de cent.
 *
 * Los script omdat `drizzle-kit push` op deze database struikelt.
 */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  await db.execute(sql`alter table time_entries alter column hourly_cost_eur type numeric(12,6)`);
  await db.execute(sql`alter table workers alter column hourly_cost_eur type numeric(12,6)`);

  const rows = await db.execute<{ tabel: string; type: string; scale: number }>(sql`
    select table_name as tabel, data_type as type, numeric_scale as scale
    from information_schema.columns
    where column_name = 'hourly_cost_eur' and table_name in ('time_entries', 'workers')
    order by 1`);
  for (const r of rows) console.log(`OK: ${r.tabel}.hourly_cost_eur ${r.type}(scale ${r.scale})`);

  // Bestaande urenregels uit een inkoopfactuur bijstellen naar het factuurbedrag.
  const fix = await db.execute<{ n: number }>(sql`
    with te as (
      select t.id, t.hours,
             coalesce(po.subtotal, po.total)::numeric as bedrag
      from time_entries t
      join purchase_orders po on po.id = t.purchase_order_id
      where t.hours > 0 and coalesce(po.subtotal, po.total) is not null
        and abs(t.hours * t.hourly_cost_eur - coalesce(po.subtotal, po.total)::numeric) between 0.001 and 1
    )
    update time_entries t
       set hourly_cost_eur = round(te.bedrag / te.hours, 6)
      from te where te.id = t.id
    returning 1 as n`);
  console.log(`Bijgestelde urenregels: ${fix.length}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
