/**
 * Eenmalig: items in 'other' opnieuw doorlopen met uitgebreide regels.
 * Match logica volgt lib/email-attachments.ts maar staat hier zelfstandig.
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type Cat = "opex" | "supplier-invoice" | "freight-invoice" | "agent-fee-spain" | "customs-dua";

function classify(filename: string, subject: string, fromName: string, fromEmail: string): Cat | null {
  const t = `${filename} ${subject}`;
  const f = `${fromName} ${fromEmail}`;

  // Opex
  if (
    /creadores\s*sorprendentes|alquiler.*camí|alquiler.*javea|warehouse\s*rental|anexo.*contrato.*alquiler/i.test(t) ||
    /B5\d{2}\.?\s*CREADORES/i.test(filename) ||
    /\belectric\s*consumpti|electricidad|iberdrola|endesa|naturgy|gastos\s*suplidos/i.test(t) ||
    /\bforklift|carretilla.*elev|sabadell.*renting/i.test(t) ||
    /^P\d{4}\.pdf$/i.test(filename) ||
    /google\s*workspace|microsoft\s*365|holded\s*invoice|aecoc/i.test(t) ||
    /\bseguro|verzekering|p[oó]liza|insurance.*habitat|D&O/i.test(t) ||
    /^INVOICE\s+A1[2-6][0-9]/i.test(filename) ||
    /csaba\s*team/i.test(f) ||
    /works[_\s]*costs[_\s]*summary/i.test(filename) ||
    /trademark|deborah\s*vincze|mary\s*loas/i.test(f + " " + t) ||
    /jysk\s*empresas/i.test(t) ||
    /aecoc/i.test(f) || /F26ALT\d+/i.test(filename) ||
    /A-Factura A2[56]/i.test(filename) ||  // Teresa fwd warehouse rental
    /FAC_\d{4}_\d{5}/i.test(filename) // generieke Spaanse leverancier-facturen
  ) {
    return "opex";
  }

  // Supplier invoice — Cornelius, Magic Stone via Teresa, etc.
  if (
    /cornelius|inkoop\s*order\s*cornelius/i.test(f + " " + t) ||
    /FACTURA_MARTRM-F[A-Z]+\d+/i.test(filename) ||
    /habitat\s*one.*updated.*invoice|credit\s*note\s*\d{9,}/i.test(t)
  ) {
    return "supplier-invoice";
  }

  // Freight — Transportes Garcia Costa
  if (/transportes\s*garcia\s*costa/i.test(t) || /^FRA000\d+/i.test(filename)) {
    return "freight-invoice";
  }

  // Customs / HS-code referenties — BorradorH1IMCAU files van Teresa
  if (/HS\s*code.*duty|BorradorH1IMCAU|H1IMCAU.*OPERVAL/i.test(t)) {
    return "customs-dua";
  }

  // Chinees: 发票 = factuur → supplier-invoice
  if (/发票/.test(filename) && /KAY\s*LEE|kayflex|magic.*stone/i.test(f)) {
    return "supplier-invoice";
  }

  return null;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT a.id, a.filename, e.subject, e.from_name, e.from_email
    FROM mail_attachments a
    INNER JOIN email_inbox e ON e.id = a.email_id
    WHERE a.category = 'other'
  `;

  const counts: Record<string, number> = {};
  for (const r of rows) {
    const c = classify(r.filename ?? "", r.subject ?? "", r.from_name ?? "", r.from_email ?? "");
    if (!c) continue;
    await sql`UPDATE mail_attachments SET category = ${c} WHERE id = ${r.id}`;
    counts[c] = (counts[c] ?? 0) + 1;
    console.log(c.padEnd(18), "|", r.filename);
  }

  const moved = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nVerschoven: ${moved}/${rows.length}`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`Resterend in 'Overig': ${rows.length - moved}`);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
