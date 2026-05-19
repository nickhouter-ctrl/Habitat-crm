import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const FINANCIAL = `('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')`;

(async () => {
  const byTo = await db.execute(sql.raw(`
    select coalesce(e.to_email, '— leeg —') as to_email,
           count(distinct e.id) as mails
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
    group by e.to_email
    order by mails desc
  `));
  console.log("=== Per TO-adres ===");
  for (const r of ((byTo as any).rows ?? byTo) as any[]) console.log(r);

  const byFrom = await db.execute(sql.raw(`
    select coalesce(e.from_email, '— leeg —') as from_email,
           coalesce(e.from_name,  '') as from_name,
           count(distinct e.id) as mails,
           bool_or(a.supplier_tag is not null) as has_supplier_tag,
           bool_or(a.amount_eur is not null and a.amount_eur > 0) as has_amount
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
    group by e.from_email, e.from_name
    order by mails desc
    limit 40
  `));
  console.log("\n=== Per FROM-adres ===");
  for (const r of ((byFrom as any).rows ?? byFrom) as any[]) console.log(r);

  // De 'onbekende supplier' mails — een sample met onderwerp om te zien of het Habitat-business is
  const unknownSample = await db.execute(sql.raw(`
    select e.id, e.from_email, e.to_email, e.subject, e.received_at, a.filename, a.category
    from email_inbox e
    join mail_attachments a on a.email_id = e.id
    where e.linked_purchase_order_id is null
      and e.status != 'archived'
      and a.category in ${FINANCIAL}
      and a.supplier_tag is null
    order by e.received_at desc
    limit 25
  `));
  console.log("\n=== Mails zonder supplier-tag (sample) ===");
  for (const r of ((unknownSample as any).rows ?? unknownSample) as any[]) {
    console.log(`  ${r.received_at?.toString?.().slice(0,10)}  TO=${r.to_email}  FROM=${r.from_email}`);
    console.log(`     subject: ${r.subject}`);
    console.log(`     file:    ${r.filename}  (${r.category})\n`);
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
