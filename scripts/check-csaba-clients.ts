/**
 * Debug: print eerste 50 regels van elke Csaba-invoice PDF zodat we kunnen
 * zien wie de klant is (HABITAT / HAELMIO / CREADORES).
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  const rows = await sql<Array<{ id: string; filename: string; storage_path: string }>>`
    SELECT id, filename, storage_path FROM mail_attachments
    WHERE filename ILIKE 'INVOICE A1%' OR filename ILIKE 'INVOICE WAREHOUSE%' OR filename ILIKE '%works_costs%'
    ORDER BY filename
  `;

  for (const a of rows) {
    const { data, error } = await sb.storage.from("email-attachments").download(a.storage_path);
    if (error || !data) { console.log(a.filename, "— DOWNLOAD FAIL"); continue; }
    const buf = Buffer.from(await data.arrayBuffer());
    const tmp = join(tmpdir(), `csaba-${randomUUID()}.pdf`);
    writeFileSync(tmp, buf);
    let txt = "";
    try {
      txt = execSync(`pdftotext -layout "${tmp}" -`, { encoding: "utf-8" });
    } catch (e) {
      console.log(a.filename, "— PDFTOTEXT FAIL");
      unlinkSync(tmp);
      continue;
    }
    unlinkSync(tmp);

    // Eerste 800 chars als één string voor regex
    const flat = txt.slice(0, 1500).replace(/\s+/g, " ");
    const haelmio = /haelmio/i.test(flat);
    const creadores = /creadores|sorprendentes/i.test(flat);
    const habitat = /habitat\s*one/i.test(flat);
    let tag = "UNCLEAR";
    if (haelmio) tag = "HAELMIO";
    else if (habitat) tag = "HABITAT";
    else if (creadores) tag = "CREADORES";
    console.log(tag.padEnd(10), "|", a.id.slice(0,8), "|", a.filename);
    if (tag === "UNCLEAR") {
      console.log("    head:", flat.slice(0, 200));
    }
  }

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
