import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const FINANCIAL = `('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')`;

(async () => {
  // 1) Per-mail aggregaat: heeft de mail (over al haar financiële bijlagen heen)
  //    een bedrag? een supplier? beide? geen?
  const perMail = await db.execute(sql.raw(`
    with mail_fin as (
      select
        e.id as email_id,
        e.subject,
        e.from_email,
        e.received_at,
        bool_or(a.amount_eur is not null and a.amount_eur > 0) as has_amount,
        bool_or(a.supplier_tag is not null)                    as has_supplier,
        bool_or(a.amount_eur is not null and a.amount_eur > 0
                and a.supplier_tag is not null)                 as has_both
      from email_inbox e
      join mail_attachments a on a.email_id = e.id
      where e.linked_purchase_order_id is null
        and e.status != 'archived'
        and a.category in ${FINANCIAL}
      group by e.id
    )
    select
      count(*)                                                          as total,
      count(*) filter (where has_both)                                  as both_present,
      count(*) filter (where not has_both and has_amount and not has_supplier) as supplier_missing,
      count(*) filter (where not has_both and has_supplier and not has_amount) as amount_missing,
      count(*) filter (where not has_amount and not has_supplier)       as both_missing
    from mail_fin
  `));
  console.log("=== Per-mail uitsplitsing ===");
  console.log((perMail as any).rows ?? perMail);

  // 2) Per categorie
  const perCat = await db.execute(sql.raw(`
    select a.category, count(distinct e.id) as mails
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
    group by a.category
    order by mails desc
  `));
  console.log("\n=== Per categorie ===");
  for (const r of ((perCat as any).rows ?? perCat) as any[]) console.log(r);

  // 3) Per supplier (waar bekend) — wie zijn de grote ontbrekers?
  const perSupplier = await db.execute(sql.raw(`
    select coalesce(a.supplier_tag, '— onbekend —') as supplier,
           count(distinct e.id) as mails,
           count(*) filter (where a.amount_eur is not null and a.amount_eur > 0) as with_amount,
           count(*) filter (where a.amount_eur is null) as without_amount
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
    group by a.supplier_tag
    order by mails desc
    limit 20
  `));
  console.log("\n=== Per supplier (top 20) ===");
  for (const r of ((perSupplier as any).rows ?? perSupplier) as any[]) console.log(r);

  // 4) Sample van mails met BEIDE info maar geen PO — waarom niet aangemaakt?
  const oddones = await db.execute(sql.raw(`
    select e.id, e.subject, e.from_email, e.received_at,
           a.filename, a.supplier_tag, a.amount_eur, a.category
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
      and a.amount_eur is not null and a.amount_eur > 0
      and a.supplier_tag is not null
    order by e.received_at desc
    limit 10
  `));
  console.log("\n=== Mails met bedrag+supplier maar zonder PO (top 10, onverwacht) ===");
  for (const r of ((oddones as any).rows ?? oddones) as any[]) console.log(r);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
