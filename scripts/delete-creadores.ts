/**
 * Verwijder alle CREADORES SORPRENDENTES SL-gerelateerde invoices uit
 * archief + purchase_orders. Strict beleid: alleen invoices voor HABITAT ONE.
 *
 * Treft:
 *  - filenames met CREADORES / SORPRENDENTES
 *  - B5xx (Camí Fontana huur-facturen)
 *  - A-Factura A2x-xx CREADORES (Teresa forward)
 *  - Factura 26500016 (handmatig geïmporteerd, gefactureerd aan CREADORES)
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 1. Vind mail-attachments
  const atts = await sql<Array<{ id: string; email_id: string; filename: string; storage_path: string }>>`
    SELECT a.id, a.email_id, a.filename, a.storage_path
    FROM mail_attachments a INNER JOIN email_inbox e ON e.id = a.email_id
    WHERE a.filename ~* 'CREADORES|SORPRENDENTES|26500016|Cam[íi]\\s*Fontana'
       OR e.subject ~* 'CREADORES|SORPRENDENTES|26500016'
       OR a.filename ~* '^B5\\d{2}\\s|^B5\\d{2}\\.'
       OR a.filename ~* 'A-Factura\\s*A2[56][-\\s]?\\d+'
  `;

  console.log(`Te verwijderen: ${atts.length} mail-bijlagen`);
  for (const a of atts) {
    const { error } = await sb.storage.from("email-attachments").remove([a.storage_path]);
    if (error) console.log(`  ! storage fail: ${a.filename} — ${error.message}`);
    await sql`DELETE FROM mail_attachments WHERE id = ${a.id}`;
    console.log(`  ✓ ${a.filename}`);
  }

  // 2. Vind purchase_orders gerelateerd aan CREADORES (de Teresa 26500016 die ik
  //    handmatig importeerde + andere)
  const pos = await sql<Array<{ id: string; supplier: string; reference: string | null; attachments: unknown }>>`
    SELECT id, supplier, reference, attachments
    FROM purchase_orders
    WHERE supplier ILIKE '%creadores%' OR supplier ILIKE '%sorprendentes%'
       OR reference = '26500016'
       OR notes ILIKE '%creadores%' OR notes ILIKE '%sorprendentes%'
  `;
  console.log(`\nTe verwijderen: ${pos.length} purchase orders`);
  for (const po of pos) {
    // Verwijder ook PO-bucket bestanden
    const attachments = Array.isArray(po.attachments) ? po.attachments : [];
    for (const a of attachments as Array<{ path?: string }>) {
      if (a.path) {
        await sb.storage.from("purchase-order-files").remove([a.path]);
      }
    }
    // Unlink email_inbox
    await sql`UPDATE email_inbox SET linked_purchase_order_id = NULL WHERE linked_purchase_order_id = ${po.id}`;
    // Delete PO
    await sql`DELETE FROM purchase_orders WHERE id = ${po.id}`;
    console.log(`  ✓ PO ${po.supplier} ${po.reference ?? ""}`);
  }

  // 3. Verwijder ook de email_inbox rows die nu géén attachments meer hebben
  //    (handmatige imports zoals 'Factura 26500016')
  const emptyEmails = await sql`
    DELETE FROM email_inbox
    WHERE NOT EXISTS (SELECT 1 FROM mail_attachments a WHERE a.email_id = email_inbox.id)
      AND from_email = 'etrading.tborras@gmail.com'
      AND subject ILIKE '%Handmatige import%'
    RETURNING id, subject
  `;
  console.log(`\nLege handmatige-import mails opgeruimd: ${emptyEmails.length}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
