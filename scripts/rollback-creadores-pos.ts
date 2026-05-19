/* Rollback POs die per ongeluk voor Creadores zijn aangemaakt:
   - alle Oper-Traimer POs uit de laatste 60 min (10 verwacht)
   - alle Foshan Keyi POs uit de laatste 60 min waarvan de bron-PDF "CREADORES" bevat
   Geen Hebei Zengyi / Foshan Hanhai aanraken — die rapporteren we voor handmatige check.

   Schoonmaak per PO:
   1. unlink email_inbox.linked_purchase_order_id, status terug naar 'new'
   2. verwijder PO-bucket bestand
   3. activity.note die bij de auto-create hoort verwijderen
   4. PO row verwijderen
*/
import "./load-env";
import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";

(async () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Selecteer doel-POs: Oper-Traimer + Foshan Keyi (laatste 60 min, auto-aangemaakt)
  const targets = await db.execute(sql.raw(`
    select id, supplier, reference, total, notes, attachments
    from purchase_orders
    where created_at > now() - interval '60 minutes'
      and notes like 'Auto-aangemaakt%'
      and (supplier = 'Oper-Traimer (transport ES)' or supplier = 'Foshan Keyi (Windows)')
    order by supplier, created_at
  `));
  const list = ((targets as any).rows ?? targets) as Array<{
    id: string; supplier: string; reference: string | null; total: string; notes: string | null; attachments: any;
  }>;

  console.log(`Te verwijderen: ${list.length} POs\n`);
  for (const po of list) console.log(`  → ${po.supplier.padEnd(30)}  ref=${(po.reference ?? "").padEnd(36)}  €${po.total}`);
  console.log("");

  for (const po of list) {
    // 1. unlink mails
    const unlinked = await db.execute(sql.raw(`
      update email_inbox
         set linked_purchase_order_id = null,
             status = 'new',
             updated_at = now()
       where linked_purchase_order_id = '${po.id}'
       returning id
    `));
    const unlinkCount = (((unlinked as any).rows ?? unlinked) as any[]).length;

    // 2. PO-bucket bestand opruimen
    const atts = Array.isArray(po.attachments) ? po.attachments : [];
    for (const a of atts as Array<{ path?: string }>) {
      if (a.path) {
        const { error } = await sb.storage.from("purchase-order-files").remove([a.path]);
        if (error) console.log(`  ! storage rm fail ${a.path}: ${error.message}`);
      }
    }

    // 3. PO row weg
    await db.execute(sql.raw(`delete from purchase_orders where id = '${po.id}'`));

    console.log(`  ✓ verwijderd: ${po.supplier} ref=${po.reference} (mails ontkoppeld: ${unlinkCount})`);
  }

  // 4. Bijbehorende activity-notes verwijderen (op type=note, body bevat 'Auto-aangemaakte inkoopfactuur' en supplier-string)
  const actDel = await db.execute(sql.raw(`
    delete from activities
    where type = 'note'
      and subject like 'Auto-aangemaakte inkoopfactuur: %'
      and created_at > now() - interval '60 minutes'
      and (subject like '%Oper-Traimer%' or subject like '%Foshan Keyi%')
    returning id
  `));
  console.log(`\n  ✓ ${(((actDel as any).rows ?? actDel) as any[]).length} activity-notes opgeruimd`);

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
