/* Maakt POs aan voor inbox-mails (TO=habitat-one) die al amount+supplier hebben
   maar nog niet gelinkt zijn aan een PO. Hergebruikt de bestaande auto-create. */
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { tryAutoCreatePurchaseInvoice } from "../lib/auto-purchase-invoice";

const FINANCIAL = `('supplier-invoice','freight-invoice','agent-fee-china','agent-fee-spain','opex','contractor')`;
const TO_HAB = `(lower(coalesce(e.to_email,'')) like '%habitat-one.com%' or lower(coalesce(e.cc_email,'')) like '%habitat-one.com%')`;

(async () => {
  const rows = await db.execute(sql.raw(`
    select distinct e.id, e.subject, e.received_at
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

  const mails = ((rows as any).rows ?? rows) as Array<{ id: string; subject: string | null; received_at: any }>;
  console.log(`${mails.length} mails klaar om verwerkt te worden\n`);

  let totalCreated = 0;
  let totalNeedReview = 0;
  let totalErrors = 0;

  for (const m of mails) {
    console.log(`→ ${m.received_at?.toString?.().slice(0,10) ?? ""}  ${m.subject ?? ""}`);
    const r = await tryAutoCreatePurchaseInvoice(m.id);
    console.log(`   created=${r.created}  needsReview=${r.needsReview}  errors=${r.errors.length}`);
    if (r.errors.length) for (const e of r.errors) console.log(`     ! ${e}`);
    totalCreated += r.created;
    totalNeedReview += r.needsReview;
    totalErrors += r.errors.length;
  }

  console.log(`\n=== Totaal ===`);
  console.log(`POs aangemaakt: ${totalCreated}`);
  console.log(`Nog needsReview: ${totalNeedReview}`);
  console.log(`Errors: ${totalErrors}`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
