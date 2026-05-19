/* Audit alle POs die in de laatste 60 minuten via auto-create zijn aangemaakt.
   Download de bron-bijlage, check welke entiteit als "CLIENTE/DESTINATARIO" staat,
   rapporteer (geen mutaties). */
import "./load-env";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

import { db } from "../lib/db";
import { sql } from "drizzle-orm";

const HABITAT_MARKERS = [/habitat\s*one/i, /ESB?24855603/i, /B-?24855603/i];
const CREADORES_MARKERS = [/creadores/i, /sorprendentes/i, /B-?19434646/i];

function categorize(text: string): "HABITAT" | "CREADORES" | "UNKNOWN" {
  if (CREADORES_MARKERS.some((r) => r.test(text))) return "CREADORES";
  if (HABITAT_MARKERS.some((r) => r.test(text))) return "HABITAT";
  return "UNKNOWN";
}

function readPdf(p: string): string {
  try {
    return execSync(`pdftotext -layout "${p}" -`, { encoding: "utf-8", timeout: 15000 });
  } catch { return ""; }
}

function readExcel(buf: Buffer): string {
  try {
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts: string[] = [];
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
      for (const r of rows) if (Array.isArray(r)) parts.push(r.map((c) => String(c ?? "")).join(" | "));
    }
    return parts.join("\n");
  } catch { return ""; }
}

(async () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const pos = await db.execute(sql.raw(`
    select po.id, po.supplier, po.reference, po.total, po.notes, po.created_at,
           e.id as email_id, e.subject, a.storage_path, a.filename, a.content_type
    from purchase_orders po
    left join email_inbox e on e.linked_purchase_order_id = po.id
    left join lateral (
      select * from mail_attachments a2
      where a2.email_id = e.id and po.notes ilike '%' || a2.filename || '%'
      limit 1
    ) a on true
    where po.created_at > now() - interval '60 minutes'
      and po.notes like 'Auto-aangemaakt%'
    order by po.created_at
  `));

  const list = ((pos as any).rows ?? pos) as Array<any>;
  console.log(`${list.length} recent aangemaakte POs te auditeren\n`);

  const result: Array<{
    po_id: string;
    supplier: string;
    reference: string | null;
    total: string;
    filename: string;
    verdict: string;
  }> = [];

  for (const r of list) {
    let text = "";
    if (r.storage_path) {
      const { data } = await sb.storage.from("email-attachments").download(r.storage_path);
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        if (/pdf/i.test(r.content_type ?? "") || r.filename?.toLowerCase().endsWith(".pdf")) {
          const tmp = path.join("/tmp", `audit-${r.po_id ?? Math.random()}.pdf`);
          fs.writeFileSync(tmp, buf);
          text = readPdf(tmp);
          try { fs.unlinkSync(tmp); } catch {}
        } else if (/sheet|excel|csv/i.test(r.content_type ?? "") || /\.xlsx?$/i.test(r.filename ?? "")) {
          text = readExcel(buf);
        }
      }
    }
    const verdict = categorize(text);
    result.push({
      po_id: r.id,
      supplier: r.supplier,
      reference: r.reference,
      total: r.total,
      filename: r.filename ?? "(niet gevonden)",
      verdict,
    });
    console.log(`  [${verdict.padEnd(9)}]  ${r.supplier.padEnd(30)}  €${r.total.padEnd(10)}  ${r.filename ?? ""}`);
  }

  const buckets = { HABITAT: 0, CREADORES: 0, UNKNOWN: 0 };
  for (const r of result) buckets[r.verdict as keyof typeof buckets]++;
  console.log(`\nSamenvatting: HABITAT=${buckets.HABITAT}  CREADORES=${buckets.CREADORES}  UNKNOWN=${buckets.UNKNOWN}`);

  // Schrijf JSON met PO-ids per verdict zodat rollback script ze kan oppakken
  fs.writeFileSync("/tmp/audit-pos.json", JSON.stringify(result, null, 2));
  console.log("\n→ /tmp/audit-pos.json (gebruik dit voor rollback)");

  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
