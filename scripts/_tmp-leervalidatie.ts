/** Leave-one-out: leer op alle beslissingen behalve één, voorspel die ene. Meet fout-positief (factuur onterecht overgeslagen). */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
type Rij = { status: string; verdict: string | null; from_email: string | null; filename: string | null; content_type: string | null; size_bytes: number | null };
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const pat = (f: string | null | undefined) => norm(f).replace(/[0-9]+/g, "#").replace(/\s+/g, " ").replace(/#(\s*[-_.]\s*#)+/g, "#-#");
const grootte = (b: number | null | undefined) => { const kb = (b ?? 0) / 1024; return !kb ? "onbekend" : kb < 60 ? "klein" : kb < 250 ? "middel" : "groot"; };
const soort = (c: string | null | undefined) => { const t = norm(c); return t.includes("pdf") ? "pdf" : t.includes("spreadsheet") || t.includes("excel") ? "sheet" : t.startsWith("image/") ? "afbeelding" : t.includes("word") ? "word" : t.includes("xml") ? "xml" : t || "onbekend"; };
const sig = (r: Rij) => { const m = norm(r.from_email); const d = m.includes("@") ? m.split("@")[1] : ""; const u = [`soort=${soort(r.content_type)}`, `grootte=${grootte(r.size_bytes)}`]; if (m) u.push(`afzender=${m}`); if (d) u.push(`domein=${d}`); if (pat(r.filename)) u.push(`bestand=${pat(r.filename)}`); if (pat(r.filename) && m) u.push(`afzender+bestand=${m}|${pat(r.filename)}`); if (r.verdict) u.push(`verdict=${norm(r.verdict)}`); return u; };
async function main() {
  const rijen = (await db.execute(sql`select r.status, r.verdict, e.from_email, a.filename, a.content_type, a.size_bytes from purchase_invoice_reviews r left join email_inbox e on e.id=r.email_id left join mail_attachments a on a.id=r.mail_attachment_id where r.status in ('approved','ignored','rejected')`)) as unknown as Rij[];
  let fp = 0, tp = 0, fn = 0, tn = 0;
  const fouten: string[] = [];
  for (const uit of rijen) {
    const rest = rijen.filter((r) => r !== uit);
    const tab = new Map<string, { goed: number; weg: number }>(); let G = 0, W = 0;
    for (const r of rest) { const weg = r.status !== "approved"; weg ? W++ : G++; for (const s of sig(r)) { const t = tab.get(s) ?? { goed: 0, weg: 0 }; weg ? t.weg++ : t.goed++; tab.set(s, t); } }
    let score = Math.log((W + 1) / (G + 1));
    for (const s of sig(uit)) { const t = tab.get(s); if (!t) continue; score += Math.log(((t.weg + 1) / (W + 2)) / ((t.goed + 1) / (G + 2))); }
    const kans = 1 / (1 + Math.exp(-score));
    const klein = soort(uit.content_type) === "afbeelding" && (uit.size_bytes ?? 0) < 60 * 1024;
    let eenduidig = false;
    for (const s of sig(uit)) { if (!/^(afzender\+bestand|bestand|afzender)=/.test(s)) continue; const t = tab.get(s); if (t && t.goed === 0 && t.weg >= 3) eenduidig = true; }
    const over = klein || eenduidig;
    const weg = uit.status !== "approved";
    if (over && weg) tp++; else if (over && !weg) { fp++; fouten.push(`${uit.from_email} | ${uit.filename} | kans ${kans.toFixed(2)}`); } else if (!over && weg) fn++; else tn++;
  }
  console.log(`${rijen.length} beslissingen
  correct overgeslagen (ruis weg):        ${tp}
  onterecht overgeslagen (FACTUUR!):      ${fp}
  ruis die toch in de lijst blijft:       ${fn}
  facturen die terecht blijven staan:     ${tn}`);
  if (fouten.length) { console.log("\nonterecht overgeslagen:"); for (const f of fouten) console.log("  " + f); }
  process.exit(0);
}
main();
