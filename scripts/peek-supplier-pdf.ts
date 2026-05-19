/* Download één PDF per leverancier en print pdftotext-output zodat we kunnen
   zien waar het TOTAAL-bedrag staat. Schrijft naar /tmp. */
import "./load-env";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const TARGETS = ["CSABAHOME SL", "Oper-Traimer (transport ES)"];

(async () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  for (const tag of TARGETS) {
    const rows = await db.execute(sql.raw(`
      select a.id, a.filename, a.storage_path, a.content_type
      from mail_attachments a
      join email_inbox e on e.id = a.email_id
      where a.supplier_tag = '${tag.replace(/'/g, "''")}'
        and a.amount_eur is null
        and lower(coalesce(a.content_type,'')) like '%pdf%'
        and e.linked_purchase_order_id is null
      limit 1
    `));
    const row = (((rows as any).rows ?? rows) as any[])[0];
    if (!row) { console.log(`[${tag}] geen PDF gevonden`); continue; }

    const { data, error } = await sb.storage.from("email-attachments").download(row.storage_path);
    if (error || !data) { console.log(`[${tag}] download fail: ${error?.message}`); continue; }

    const buf = Buffer.from(await data.arrayBuffer());
    const localPdf = path.join("/tmp", `peek-${tag.replace(/\W+/g, "_")}.pdf`);
    fs.writeFileSync(localPdf, buf);
    const localTxt = localPdf.replace(/\.pdf$/, ".txt");
    try {
      execSync(`pdftotext -layout "${localPdf}" "${localTxt}"`);
      const txt = fs.readFileSync(localTxt, "utf-8");
      console.log(`\n\n===== ${tag} — ${row.filename} =====`);
      console.log(txt.slice(0, 4000));
      console.log(`----- (truncated, full: ${localTxt}) -----`);
    } catch (e) {
      console.log(`pdftotext fail: ${e instanceof Error ? e.message : e}`);
    }
  }

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
