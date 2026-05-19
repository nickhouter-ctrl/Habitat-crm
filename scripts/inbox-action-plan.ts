import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const FINANCIAL = `('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')`;

const TO_HAB = `(lower(coalesce(e.to_email,'')) like '%habitat-one.com%' or lower(coalesce(e.cc_email,'')) like '%habitat-one.com%')`;

(async () => {
  // 1) Hoeveel zijn "voor habitat-one" (TO of CC bevat habitat-one.com)?
  const split = await db.execute(sql.raw(`
    with mail_fin as (
      select e.id, ${TO_HAB} as is_habitat
      from email_inbox e
      join mail_attachments a on a.email_id = e.id
      where e.linked_purchase_order_id is null
        and e.status != 'archived'
        and a.category in ${FINANCIAL}
      group by e.id, e.to_email, e.cc_email
    )
    select is_habitat, count(*) as mails from mail_fin group by is_habitat
  `));
  console.log("=== Habitat One vs niet-Habitat One ===");
  for (const r of ((split as any).rows ?? split) as any[]) console.log(r);

  // 2) De niet-habitat mails — welke zijn dit precies?
  const notHab = await db.execute(sql.raw(`
    select distinct e.id, e.from_email, e.to_email, e.subject, e.received_at
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
      and not ${TO_HAB}
  `));
  console.log("\n=== Mails die NIET voor Habitat One zijn (overslaan) ===");
  for (const r of ((notHab as any).rows ?? notHab) as any[]) {
    console.log(`  TO=${r.to_email}  FROM=${r.from_email}\n     subject: ${r.subject}\n`);
  }

  // 3) De 5 anomalieën — habitat-one mails met BEIDE info maar geen PO
  const anomalies = await db.execute(sql.raw(`
    select e.id, e.from_email, e.subject, e.received_at,
           a.id as att_id, a.filename, a.supplier_tag, a.amount_eur, a.category
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
      and ${TO_HAB}
      and a.amount_eur is not null and a.amount_eur > 0
      and a.supplier_tag is not null
    order by e.received_at desc
  `));
  console.log("\n=== KLAAR om PO aan te maken (amount+supplier aanwezig) ===");
  for (const r of ((anomalies as any).rows ?? anomalies) as any[]) {
    console.log(`  ${r.received_at?.toString?.().slice(0,10)}  ${r.supplier_tag}  €${r.amount_eur}  [${r.category}]`);
    console.log(`     mail:    ${r.subject}`);
    console.log(`     bijlage: ${r.filename}\n`);
  }

  // 4) Banco Sabadell — bank statement die als freight is geclassificeerd?
  const sabadell = await db.execute(sql.raw(`
    select e.id, e.subject, a.id as att_id, a.filename, a.category, a.supplier_tag
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and lower(coalesce(a.supplier_tag,'')) like '%sabadell%'
  `));
  console.log("\n=== Banco Sabadell mails (mogelijk verkeerd geclassificeerd) ===");
  for (const r of ((sabadell as any).rows ?? sabadell) as any[]) console.log(r);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
