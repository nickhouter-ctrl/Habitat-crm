/**
 * Strikte herclassificatie met duidelijke prioriteit:
 *   1. certificate    (CE-doc, performance, EN-1634)
 *   2. customs-dua    (LEVANTE / 23T- / DUA / Borrador / Declaracion / BL / TMMI)
 *   3. opex           (CREADORES, INVOICE A1xx, P-, AECOC, trademark, JYSK, Google)
 *   4. supplier-invoice (FACTURA_MARTRM, CI-MS/KY/HL/YH, KKR PI, Cornelius, 发票)
 *   5. agent-fee-china (handling-costs filename OF sender=Allpack)
 *   6. agent-fee-spain (Teresa eigen factuur: Factura 26500\d+)
 *   7. freight-invoice (FRA, ALBARAN GLOBALIZADOS, Transportes Garcia)
 *   8. quote-proforma  (PROFORMA, OFFERTE)
 *   9. eigen kostprijs/verkoop xlsx → other
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

type Cat =
  | "supplier-invoice"
  | "agent-fee-china"
  | "agent-fee-spain"
  | "freight-invoice"
  | "customs-dua"
  | "opex"
  | "bank-statement"
  | "quote-proforma"
  | "certificate"
  | "other";

function classify(filename: string, fromEmail: string, fromName: string): Cat | null {
  const fn = filename;
  const sender = `${fromName} ${fromEmail}`.toLowerCase();

  // 1. Certificaten
  if (/declaration\s*of\s*performance|EN[\s-]*1634|conformity\s*declaration|欧标.*证书|CE[_\s-]*cert/i.test(fn)) {
    return "certificate";
  }

  // 2. Customs / DUA (filename-only — strict)
  if (
    /^LEVANTE/i.test(fn) ||
    /^23T[CA][_-]?\d/i.test(fn) ||
    /certificado.*importaci/i.test(fn) ||
    /^BorradorH1IMCAU|H1IMCAU.*OPERVAL/i.test(fn) ||
    /^DUA[-\s]?\d|HS[_\s-]*CODE.*DUTY/i.test(fn) ||
    /^20260\d{10,}\.pdf$/i.test(fn) ||
    /^import\s*taxes/i.test(fn) ||
    /Declaracion[_\s]*uso[_\s]*propio|Declarac.{0,3}n.*envases/i.test(fn) ||
    /^IMPORTACION\s*H1|InfoH1[_\s]*IV\d+/i.test(fn) ||
    /^\(?\d?\)?\s*BL[_\s-]?\d{6,}/i.test(fn) ||
    /^TMMI\d+|^SZN\d+/i.test(fn) ||
    /espa[ñn]a\s*trading.*SLU/i.test(fn) ||
    /alianza.*transport/i.test(fn)
  ) {
    return "customs-dua";
  }

  // 3. Opex
  if (
    /CREADORES\s*SORPRENDENTES|alquiler.*camí|warehouse\s*rental|anexo.*contrato.*alquiler/i.test(fn) ||
    /B5\d{2}\.?\s*CREADORES/i.test(fn) ||
    /\belectric\s*consumpti|gastos\s*suplidos/i.test(fn) ||
    /^P\d{4}\.pdf$/i.test(fn) ||
    /google\s*workspace|holded.*invoice|aecoc/i.test(fn) ||
    /poliza|insurance.*habitat|D&O/i.test(fn) ||
    /^INVOICE\s+A1[2-6][0-9]/i.test(fn) ||
    /works[_\s]*costs[_\s]*summary/i.test(fn) ||
    /trademark|HAB\s*\d+-\d+.*UE|registro.*marca/i.test(fn) ||
    /jysk\s*empresas/i.test(fn) ||
    /F26ALT\d+|^FAC_\d{4}_\d{5}/i.test(fn) ||
    /A-Factura\s*A2[56]/i.test(fn) ||
    /csaba/i.test(sender)
  ) {
    return "opex";
  }

  // 4. Allpack handling-fee — EERST want "CI-MS... -handling costs" moet hier landen
  // niet bij supplier-invoice
  if (/handling[\s-]*costs?|handling[\s-]*fee/i.test(fn)) {
    return "agent-fee-china";
  }

  // 5. Supplier invoice — factory CIs (zelfs als ze via Allpack/Teresa zijn doorgestuurd)
  if (
    /^FACTURA_MARTRM-F[A-Z]+\d+/i.test(fn) ||
    /^CI[\s-]*33#?kkr.*without/i.test(fn) ||
    /^CI[\s-]*MS\d+.*XBY|^CI-MS\d{6,}\.xls/i.test(fn) ||
    /^CI[\s-]*HL\d+|^CI[\s-]*YH\d+/i.test(fn) ||
    /^CI[\s-]*AP\d+/i.test(fn) ||
    /^CI-KY086-\d+/i.test(fn) ||
    /^Commercial\s*Invoice\s*for\s*PJ\d+/i.test(fn) ||
    /YOHOME[\s-]*Commercial\s*invoice/i.test(fn) ||
    /KKR\s*PI\s*33#kkr/i.test(fn) ||
    /^Habitat\s*One\s*Updated\s*invoice|^Credit\s*Note\s*\d{9,}/i.test(fn) ||
    /发票.*invoice/i.test(fn) ||
    /HN-K-20\d+-S-PL.*(without|backing\s*board)/i.test(fn) ||
    /^waterproof\s*backing\s*board.*kaylee/i.test(fn)
  ) {
    return "supplier-invoice";
  }

  // 6. Allpack als afzender (na supplier-invoice, want supplier CIs zijn vaak ook door Allpack gestuurd)
  if (/allpack-?ent\.com|@allpack/i.test(sender)) {
    return "agent-fee-china";
  }

  // 6. Teresa eigen factuur (haar commissie-bonnen)
  if (/^Factura\s*265\d{5}/i.test(fn) || /espa[ñn]a\s*trading\.tborras|tborras@.*hotmail/i.test(sender)) {
    // alleen als 'Factura 26500\d+' filename — niet wanneer Teresa een MS-factuur doorstuurt
    if (/^Factura\s*265\d{5}/i.test(fn)) return "agent-fee-spain";
  }

  // 7. Freight
  if (
    /^FRA000\d+/i.test(fn) ||
    /^ALBARAN\s*GLOBALIZADOS/i.test(fn) ||
    /transportes\s*garcia\s*costa/i.test(fn) ||
    /alianza|galadtrans/i.test(sender)
  ) {
    return "freight-invoice";
  }

  // 8. Quote / Proforma
  if (/^PROFORMA|^Pro[-\s]*forma|revised\s*PI|^Quotation/i.test(fn)) {
    return "quote-proforma";
  }

  // 9. Eigen kostprijs/verkoop xlsx
  if (
    /\.(xlsx?|csv)$/i.test(fn) &&
    /\b(kostprijs|inkoop[_\s-]*verkoop|verkoop[_\s-]*prijs|prijslijst|staffel|kalkulatie|berekening)\b/i.test(fn)
  ) {
    return "other";
  }

  return null;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT a.id, a.filename, a.category, e.from_name, e.from_email
    FROM mail_attachments a
    INNER JOIN email_inbox e ON e.id = a.email_id
  `;

  const moves: Record<string, number> = {};
  let touched = 0;
  for (const r of rows) {
    const want = classify(r.filename ?? "", r.from_email ?? "", r.from_name ?? "");
    if (want && want !== r.category) {
      await sql`UPDATE mail_attachments SET category = ${want} WHERE id = ${r.id}`;
      const key = `${r.category} → ${want}`;
      moves[key] = (moves[key] ?? 0) + 1;
      console.log(`${r.category.padEnd(17)} → ${want.padEnd(17)} | ${r.filename}`);
      touched++;
    }
  }

  console.log(`\nSamenvatting (${touched} verplaatst):`);
  for (const [k, v] of Object.entries(moves).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)}  ${k}`);
  }

  const final = await sql`SELECT category, COUNT(*) FROM mail_attachments GROUP BY 1 ORDER BY 2 DESC`;
  console.log("\nEindverdeling:");
  for (const x of final) console.log(`  ${x.count.toString().padStart(4)}  ${x.category}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
