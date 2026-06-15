/**
 * Data-gezondheid-agent: draait dagelijks een set deterministische controles op de
 * database (dubbele documenten/pakbonnen, negatieve voorraad, vervallen facturen,
 * valuta-verdachte inkooporders, leveringen die over datum zijn, offertes die nog
 * afgerekend moeten worden) en mailt de bevindingen naar de eigenaar. Optioneel
 * schrijft Claude er een korte, geprioriteerde samenvatting bij.
 */
import "server-only";
import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { COMPANY } from "@/lib/company";
import { sendEmail } from "@/lib/email";
import { formatEUR } from "@/lib/utils";

type Finding = { key: string; label: string; count: number; detail?: string; severity: "warn" | "info" };

async function one(query: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
  const rows = (await db.execute(query)) as unknown as Record<string, unknown>[];
  return rows[0] ?? {};
}

export async function runDataHealth(): Promise<{ ok: boolean; findings: Finding[]; emailed: boolean }> {
  const findings: Finding[] = [];

  // 1. Dubbele documentnummers.
  const dupDocs = await one(sql`
    SELECT count(*)::int AS n, string_agg(doc_number, ', ') AS sample FROM (
      SELECT doc_number FROM documents WHERE doc_number IS NOT NULL
      GROUP BY doc_number HAVING count(*) > 1 LIMIT 10) x`);
  if (Number(dupDocs.n) > 0)
    findings.push({ key: "dup_docnumbers", label: "Dubbele documentnummers", count: Number(dupDocs.n), detail: String(dupDocs.sample ?? ""), severity: "warn" });

  // 2. Dubbele pakbonnen voor dezelfde factuur.
  const dupNotes = await one(sql`
    SELECT count(*)::int AS n FROM (
      SELECT source_document_id FROM documents
      WHERE kind='deliverynote' AND status <> 'void' AND source_document_id IS NOT NULL
      GROUP BY source_document_id HAVING count(*) > 1) x`);
  if (Number(dupNotes.n) > 0)
    findings.push({ key: "dup_pakbonnen", label: "Facturen met meerdere pakbonnen", count: Number(dupNotes.n), severity: "warn" });

  // 3. Negatieve voorraad (niet op-bestelling).
  const negStock = await one(sql`
    SELECT count(*)::int AS n FROM products
    WHERE coalesce(stock_qty,0) < 0 AND is_active = true`);
  if (Number(negStock.n) > 0)
    findings.push({ key: "neg_stock", label: "Producten met negatieve voorraad — bijbestellen", count: Number(negStock.n), severity: "warn" });

  // 4. Verstuurde/betaalde facturen met productregels die nog niet zijn afgeboekt.
  const unbooked = await one(sql`
    SELECT count(*)::int AS n FROM documents
    WHERE kind='invoice' AND status IN ('sent','paid','partially_paid','overdue')
      AND stock_applied_at IS NULL`);
  if (Number(unbooked.n) > 0)
    findings.push({ key: "unbooked", label: "Verstuurde/betaalde facturen — voorraad nog niet afgeboekt", count: Number(unbooked.n), severity: "info" });

  // 5. Vervallen facturen.
  const overdue = await one(sql`
    SELECT count(*)::int AS n, coalesce(sum(coalesce(total_eur,0)-coalesce(paid_eur,0)),0)::float8 AS v
    FROM documents WHERE kind='invoice' AND status NOT IN ('paid','void','draft','rejected') AND due_date < current_date`);
  if (Number(overdue.n) > 0)
    findings.push({ key: "overdue", label: "Vervallen facturen", count: Number(overdue.n), detail: formatEUR(Number(overdue.v)) + " openstaand", severity: "warn" });

  // 6. Inkooporders die mogelijk in een andere valuta zijn maar als EUR staan.
  const usdSuspect = await one(sql`
    SELECT count(*)::int AS n FROM purchase_orders
    WHERE coalesce(currency,'EUR')='EUR'
      AND (reference ILIKE '%usd%' OR reference ILIKE '%dollar%' OR reference ILIKE '%（usd%')
      AND coalesce(notes,'') NOT ILIKE '%omgerekend%'`);
  if (Number(usdSuspect.n) > 0)
    findings.push({ key: "usd_suspect", label: "Inkooporders mogelijk USD maar als EUR opgeslagen", count: Number(usdSuspect.n), severity: "warn" });

  // 7. Leveringen die over hun geplande datum zijn maar niet als geleverd staan.
  const lateDeliv = await one(sql`
    SELECT count(*)::int AS n FROM deliveries
    WHERE status IN ('gepland','onderweg') AND planned_date < current_date`);
  if (Number(lateDeliv.n) > 0)
    findings.push({ key: "late_deliveries", label: "Geplande leveringen over datum — markeer geleverd", count: Number(lateDeliv.n), severity: "info" });

  // 8. Offertes die deels gefactureerd zijn (eindafrekening staat open).
  const toSettle = await one(sql`
    SELECT count(*)::int AS n FROM documents est
    WHERE est.kind='estimate' AND est.status = 'accepted'
      AND (SELECT coalesce(sum(coalesce(inv.total_eur,0)),0) FROM documents inv
           WHERE inv.kind='invoice' AND inv.status <> 'void' AND inv.source_document_id = est.id) > 0.01
      AND (SELECT coalesce(sum(coalesce(inv.total_eur,0)),0) FROM documents inv
           WHERE inv.kind='invoice' AND inv.status <> 'void' AND inv.source_document_id = est.id) < coalesce(est.total_eur,0) - 0.01`);
  if (Number(toSettle.n) > 0)
    findings.push({ key: "to_settle", label: "Offertes nog af te rekenen (deels gefactureerd)", count: Number(toSettle.n), severity: "info" });

  if (findings.length === 0) return { ok: true, findings, emailed: false };

  const aiSummary = await summarize(findings);
  const to = process.env.NOTIFY_EMAIL?.trim() || COMPANY.email;
  const html = buildHtml(findings, aiSummary);
  const text = findings.map((f) => `• ${f.label}: ${f.count}${f.detail ? ` (${f.detail})` : ""}`).join("\n");
  const res = await sendEmail({
    to,
    subject: `Habitat — dagelijkse data-check (${findings.length} ${findings.length === 1 ? "punt" : "punten"})`,
    html,
    text,
  });
  return { ok: true, findings, emailed: res.sent };
}

function buildHtml(findings: Finding[], summary: string | null): string {
  const rows = findings
    .map(
      (f) =>
        `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee">${f.severity === "warn" ? "⚠️" : "ℹ️"} ${escape(f.label)}</td>
         <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${f.count}</td>
         <td style="padding:8px 10px;border-bottom:1px solid #eee;color:#777">${escape(f.detail ?? "")}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#1c1c1a;max-width:640px">
    <h2 style="margin:0 0 4px">Data-check ${COMPANY.name}</h2>
    ${summary ? `<p style="background:#f6f3ec;border-radius:8px;padding:12px 14px;white-space:pre-wrap">${escape(summary)}</p>` : ""}
    <table style="border-collapse:collapse;width:100%;font-size:14px"><tbody>${rows}</tbody></table>
    <p style="color:#999;font-size:12px;margin-top:14px">Automatische controle — open het CRM om de details te bekijken.</p>
  </div>`;
}

/** Optioneel: laat Claude een korte, geprioriteerde NL-samenvatting schrijven. */
async function summarize(findings: Finding[]): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: `Je bent de assistent van een interieur/bouw-CRM (Habitat One, Spanje). Hieronder de uitkomst van de dagelijkse data-controle als JSON. Schrijf in het Nederlands een korte, vriendelijke samenvatting (max 4 zinnen) die de eigenaar vertelt wat het belangrijkst is om vandaag op te pakken, met de belangrijkste eerst. Geen opsomming, gewoon lopende tekst.\n\n${JSON.stringify(findings)}`,
          },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === "text" && b.text).map((b) => b.text!).join("\n").trim();
    return text || null;
  } catch {
    return null;
  }
}

function escape(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}
