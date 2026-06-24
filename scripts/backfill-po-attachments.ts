/**
 * Loop alle inkoopfacturen na: als er een gelinkte mail is en de PO heeft
 * géén attachments, kopieer dan de mail-bijlagen naar de PO-bucket en voeg
 * ze toe aan purchase_orders.attachments.
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const MAIL_BUCKET = "email-attachments";
const PO_BUCKET = "purchase-order-files";

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "bestand";
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Zorg dat de PO-bucket bestaat
  const { data: bucket } = await sb.storage.getBucket(PO_BUCKET);
  if (!bucket) {
    console.log(`Bucket ${PO_BUCKET} aanmaken…`);
    const r = await sb.storage.createBucket(PO_BUCKET, { public: false, fileSizeLimit: 26214400 });
    if (r.error) {
      console.error("Bucket-create fail:", r.error.message);
      process.exit(1);
    }
  }

  // Vind alle PO's die een gelinkte mail hebben — pak hun bijlagen
  const rows = await sql<Array<{
    po_id: string;
    po_supplier: string;
    po_attachments: unknown;
    email_id: string;
    att_id: string;
    att_filename: string;
    att_storage_path: string;
    att_size: number | null;
  }>>`
    SELECT po.id AS po_id, po.supplier AS po_supplier, po.attachments AS po_attachments,
           e.id AS email_id,
           a.id AS att_id, a.filename AS att_filename, a.storage_path AS att_storage_path, a.size_bytes AS att_size
    FROM purchase_orders po
    INNER JOIN email_inbox e ON e.linked_purchase_order_id = po.id
    INNER JOIN mail_attachments a ON a.email_id = e.id
    WHERE a.content_type LIKE 'application/%' OR a.content_type LIKE 'image/%'
    ORDER BY po.id, a.received_at
  `;

  console.log(`Found ${rows.length} potential PO-bijlage relaties\n`);

  // Group per PO
  const byPo = new Map<string, { po_supplier: string; existing: any[]; atts: typeof rows }>();
  for (const r of rows) {
    if (!byPo.has(r.po_id)) {
      const existing = Array.isArray(r.po_attachments) ? r.po_attachments : [];
      byPo.set(r.po_id, { po_supplier: r.po_supplier, existing, atts: [] });
    }
    byPo.get(r.po_id)!.atts.push(r);
  }

  let copied = 0;
  let skipped = 0;
  let added = 0;
  for (const [poId, info] of byPo) {
    const existingNames = new Set(info.existing.map((x: any) => x.name));
    const toAdd = info.atts.filter((a) => !existingNames.has(a.att_filename));
    if (toAdd.length === 0) {
      skipped++;
      continue;
    }
    console.log(`PO ${poId.slice(0, 8)} (${info.po_supplier}): +${toAdd.length} bijlage${toAdd.length === 1 ? "" : "n"}`);

    const newAttachments = [...info.existing];
    for (const a of toAdd) {
      // Download from mail-bucket
      const { data, error } = await sb.storage.from(MAIL_BUCKET).download(a.att_storage_path);
      if (error || !data) {
        console.log(`  ! download fail: ${a.att_filename} — ${error?.message}`);
        continue;
      }
      const buf = Buffer.from(await data.arrayBuffer());
      const path = `${randomUUID()}-${safeName(a.att_filename)}`;
      const up = await sb.storage.from(PO_BUCKET).upload(path, buf, {
        contentType: data.type || "application/octet-stream",
        upsert: false,
      });
      if (up.error) {
        console.log(`  ! upload fail: ${a.att_filename} — ${up.error.message}`);
        continue;
      }
      newAttachments.push({
        name: a.att_filename,
        path,
        size: buf.length,
        uploadedAt: new Date().toISOString(),
      });
      copied++;
      console.log(`  ✓ ${a.att_filename}`);
    }

    if (newAttachments.length > info.existing.length) {
      // sql.json() bindt als één jsonb-waarde. (NIET JSON.stringify(...)::jsonb —
      // dat dubbel-encodeert in deze postgres-driver tot een jsonb-string.)
      await sql`
        UPDATE purchase_orders
        SET attachments = ${sql.json(newAttachments)}, updated_at = NOW()
        WHERE id = ${poId}
      `;
      added++;
    }
  }

  console.log(`\nSamenvatting:`);
  console.log(`  PO's bijgewerkt: ${added}`);
  console.log(`  PO's overgeslagen (al volledig): ${skipped}`);
  console.log(`  Bijlagen gekopieerd: ${copied}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
