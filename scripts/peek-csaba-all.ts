/* Download alle Csaba PDFs en check of er tekst in zit (anders is OCR nodig). */
import "./load-env";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

(async () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const rows = await db.execute(sql.raw(`
    select a.id, a.filename, a.storage_path
    from mail_attachments a
    join email_inbox e on e.id = a.email_id
    where a.supplier_tag = 'CSABAHOME SL'
      and a.amount_eur is null
      and lower(coalesce(a.content_type,'')) like '%pdf%'
      and e.linked_purchase_order_id is null
  `));
  const list = ((rows as any).rows ?? rows) as Array<{ filename: string; storage_path: string }>;
  console.log(`${list.length} Csaba PDFs`);

  for (const r of list.slice(0, 6)) {
    const { data, error } = await sb.storage.from("email-attachments").download(r.storage_path);
    if (error || !data) { console.log(`  ! ${r.filename}: download fail`); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const localPdf = path.join("/tmp", `csaba-${r.filename.replace(/[^a-z0-9.]/gi, "_")}`);
    fs.writeFileSync(localPdf, buf);
    const localTxt = localPdf.replace(/\.pdf$/i, ".txt");
    try {
      execSync(`pdftotext -layout "${localPdf}" "${localTxt}"`);
      const txt = fs.readFileSync(localTxt, "utf-8").trim();
      console.log(`\n--- ${r.filename}  (${txt.length} chars text) ---`);
      if (txt.length > 0) {
        const total = txt.match(/(total|importe|sum|net|grand)[^\n]{0,120}/gi);
        if (total) console.log(total.slice(0, 6).join("\n"));
      } else {
        console.log("  (image-based — needs OCR)");
      }
    } catch (e) {
      console.log(`  pdftotext err: ${e instanceof Error ? e.message : e}`);
    }
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
