/* Rollback de 3 POs met onjuiste bedragen (extractor pakte regel-item ipv TOTAL).
   Markeer de overige 2 POs met een notitie dat ze in USD zijn, niet EUR. */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const BOGUS_FILENAMES = [
  "CI-HANH002604010001.xls",
  "HN-K-20251208-S-PL( waterproof backing board)1.16 -handling costs.xlsx",
  "HN-K-20251208-S-PL( waterproof backing board)1.16(without 15%).xlsx",
];

const USD_FILENAMES = [
  "CI-HANH002604010001 -handling costs 4.1.xlsx",
  "HN-K-20251208-S-PL( waterproof backing board)1.19 -handling costs.xlsx",
];

(async () => {
  // 1. Bogus rollback
  for (const fn of BOGUS_FILENAMES) {
    const r = await db.execute(sql.raw(`
      select id, supplier, reference, total, notes from purchase_orders
      where notes like ${"$$"}%Bijlage: ${fn}${"$$"}
        and created_at > now() - interval '60 minutes'
    `));
    const pos = (((r as any).rows ?? r) as any[]);
    for (const po of pos) {
      await db.execute(sql.raw(`
        update email_inbox set linked_purchase_order_id = null, status = 'new', updated_at = now()
        where linked_purchase_order_id = '${po.id}'
      `));
      await db.execute(sql.raw(`delete from purchase_orders where id = '${po.id}'`));
      console.log(`  ✗ verwijderd ${po.supplier} ${po.reference} €${po.total}  (${fn})`);
    }
  }

  // 2. USD-flag op de 2 echte handling fees
  for (const fn of USD_FILENAMES) {
    const r = await db.execute(sql.raw(`
      update purchase_orders
        set currency = 'USD',
            notes = notes || E'\\n⚠ Bedrag is in USD, niet EUR. Auto-aangemaakt uit handling-CI Excel.'
      where notes like ${"$$"}%Bijlage: ${fn}${"$$"}
        and created_at > now() - interval '60 minutes'
        and currency = 'EUR'
      returning id, supplier, reference, total
    `));
    for (const po of (((r as any).rows ?? r) as any[])) {
      console.log(`  ⚠ USD-flag op ${po.supplier} ${po.reference} ${po.total}`);
    }
  }

  // 3. Activities opruimen voor de verwijderde POs
  const actDel = await db.execute(sql.raw(`
    delete from activities
    where type = 'note'
      and subject like 'Auto-aangemaakte inkoopfactuur: %'
      and created_at > now() - interval '60 minutes'
      and (body like '%CI-HANH002604010001.xls%'
        or body like '%waterproof backing board)1.16 -handling costs%'
        or body like '%waterproof backing board)1.16(without 15%')
    returning id
  `));
  console.log(`\n  ✓ ${(((actDel as any).rows ?? actDel) as any[]).length} activity-notes opgeruimd`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
