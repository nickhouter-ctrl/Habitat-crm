/**
 * Importeer Factura 26500016 (Teresa España Trading) handmatig in het archief
 * en maak een inkoopfactuur aan.
 *
 * Bron: ~/Downloads/Factura 26500016.pdf
 *   - Datum: 13/05/2026
 *   - Bedrag: €3.182,22 incl. BTW (base €2.629,93 + 21% IVA €552,29)
 *   - Concept: Magic Stone MS20260213-XBY commissie 5%
 *   - Gefactureerd aan: CREADORES SORPRENDENTES SL
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const PDF_PATH = "/Users/houterminiopslag/Downloads/Factura 26500016.pdf";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const pdfBuf = readFileSync(PDF_PATH);
  console.log(`PDF ${PDF_PATH}: ${pdfBuf.length} bytes`);

  // 1. Maak een 'handmatige import' email-row aan
  const emailId = randomUUID();
  const messageId = `manual-import-${emailId}`;
  await sql`
    INSERT INTO email_inbox (
      id, message_id, imap_uid, thread_id, from_email, from_name,
      to_email, subject, received_at, status, attachments
    ) VALUES (
      ${emailId}, ${messageId}, 0, 'manual',
      'etrading.tborras@gmail.com', 'teresa borras',
      'purchase@habitat-one.com', 'Handmatige import: Factura 26500016',
      '2026-05-13T08:00:00Z', 'new',
      ${JSON.stringify([{ filename: "Factura 26500016.pdf", size: pdfBuf.length, contentType: "application/pdf" }])}::jsonb
    )
  `;
  console.log(`✓ email_inbox row aangemaakt: ${emailId}`);

  // 2. Upload PDF naar email-attachments bucket
  const storagePath = `manual/${emailId}/Factura_26500016.pdf`;
  const up = await sb.storage.from("email-attachments").upload(storagePath, pdfBuf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error(`Storage upload: ${up.error.message}`);
  console.log(`✓ PDF geüpload naar email-attachments/${storagePath}`);

  // 3. Maak mail_attachments row aan
  const attId = randomUUID();
  await sql`
    INSERT INTO mail_attachments (
      id, email_id, filename, content_type, size_bytes, storage_path,
      category, supplier_tag, amount_eur, received_at
    ) VALUES (
      ${attId}, ${emailId}, 'Factura 26500016.pdf', 'application/pdf',
      ${pdfBuf.length}, ${storagePath},
      'agent-fee-spain', 'Teresa (ES agent)', '3182.22',
      '2026-05-13T08:00:00Z'
    )
  `;
  console.log(`✓ mail_attachments row aangemaakt: ${attId}`);

  // 4. Kopieer naar PO-bucket
  const poBucketPath = `${randomUUID()}-Factura_26500016.pdf`;
  const up2 = await sb.storage.from("purchase-order-files").upload(poBucketPath, pdfBuf, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up2.error) throw new Error(`PO bucket: ${up2.error.message}`);

  // 5. Maak purchase_orders row aan
  const poId = randomUUID();
  await sql`
    INSERT INTO purchase_orders (
      id, supplier, reference, status, currency, order_date, received_at,
      total, subtotal, tax, items, attachments, notes, stock_applied_at
    ) VALUES (
      ${poId},
      'España Trading SLU (Teresa)',
      '26500016',
      'received',
      'EUR',
      '2026-05-13',
      '2026-05-13T08:00:00Z',
      '3182.22',
      '2629.93',
      '552.29',
      ${JSON.stringify([{
        name: "Magic Stone MS20260213-XBY commissie 5%",
        units: 1,
        unitPrice: 2629.93,
        note: "Bron: Factura 26500016.pdf · gefactureerd aan CREADORES SORPRENDENTES SL"
      }])}::jsonb,
      ${JSON.stringify([{
        name: "Factura 26500016.pdf",
        path: poBucketPath,
        size: pdfBuf.length,
        uploadedAt: new Date().toISOString(),
      }])}::jsonb,
      'Handmatig geïmporteerd. Concept: Magic Stone MS20260213-XBY 5% commissie op basis €52.598,50. Gefactureerd aan CREADORES SORPRENDENTES SL.',
      NOW()
    )
  `;
  console.log(`✓ purchase_orders row aangemaakt: ${poId}`);

  // 6. Link mail → PO
  await sql`UPDATE email_inbox SET linked_purchase_order_id = ${poId}, status = 'linked' WHERE id = ${emailId}`;
  console.log(`✓ Mail gelinkt aan PO`);

  console.log(`\nKlaar! Open /inkooporders/${poId} in CRM om te bekijken.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
