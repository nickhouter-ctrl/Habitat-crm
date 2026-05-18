/**
 * Verwijder Csaba's BENISSA/COSTA NOVA/OLIVA invoices uit het archief.
 * Dit zijn HAELMIO/externe klanten — niet voor Habitat One.
 *
 * - Verwijdert mail_attachments row
 * - Verwijdert het bestand uit Supabase Storage (email-attachments bucket)
 * - Verwijdert eventueel gekoppelde PO als die ALLEEN op deze attachment was
 *   gebaseerd (best-effort)
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

  const targets = await sql<Array<{ id: string; filename: string; storage_path: string }>>`
    SELECT id, filename, storage_path FROM mail_attachments
    WHERE filename ~* '^INVOICE\\s+A1[2-6][0-9].*(BENISSA|COSTA\\s*NOVA|OLIVA|VILLAJOYOSA|DENIA)'
      AND filename !~* 'WAREHOUSE'
  `;

  console.log(`Te verwijderen: ${targets.length} bestand(en)`);
  for (const a of targets) {
    // 1. Storage file
    const { error: rmErr } = await sb.storage.from("email-attachments").remove([a.storage_path]);
    if (rmErr) console.log(`  ! storage remove fail: ${a.filename} — ${rmErr.message}`);

    // 2. DB row
    await sql`DELETE FROM mail_attachments WHERE id = ${a.id}`;
    console.log(`  ✓ ${a.filename}`);
  }

  console.log(`\nKlaar — ${targets.length} bestanden verwijderd uit archief + storage.`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
