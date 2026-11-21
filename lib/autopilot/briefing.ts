/**
 * Ochtendbriefing voor Nick (07:30 Madrid): wat staat er vandaag, wat is er
 * binnengekomen, wat wacht op hem. Alleen lezen. Gaat per mail en is via de
 * Hermes-bridge (`briefing`) op te halen voor Telegram.
 */
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { getLiveStatsCached } from "@/lib/meta/live-stats";
import { formatEUR } from "@/lib/utils";
import { recentAccountDecisions } from "./accounts";
import { recentLaborDecisions } from "./labor-invoices";
import { listProposals } from "./quotes";

const OWNER = process.env.HERMES_AGENT_OWNER_EMAIL || "nick@habitat-one.com";
const TZ = "Europe/Madrid";

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Row[];
const time = (d: unknown) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(String(d)));

export type Briefing = { title: string; sections: { heading: string; lines: string[] }[] };

export async function buildBriefing(): Promise<Briefing> {
  const [appointments, tasks, requests, mails, invoices, overdue, proposals, accounts, labor] = await Promise.all([
    rows(sql`select title, starts_at, all_day, location from appointments
      where status <> 'cancelled' and (starts_at at time zone ${TZ})::date = (now() at time zone ${TZ})::date order by starts_at`),
    rows(sql`select a.subject, a.due_at, c.name as contact from activities a left join contacts c on c.id = a.contact_id
      join users u on u.id = a.assignee_id
      where a.type = 'task' and a.completed_at is null and lower(u.email) = ${OWNER}
        and (a.due_at at time zone ${TZ})::date <= (now() at time zone ${TZ})::date order by a.due_at limit 15`),
    rows(sql`select name, kind, coalesce(company, '') as company from quote_requests where created_at > now() - interval '24 hours' order by created_at desc limit 15`),
    rows(sql`select count(*)::int as n from inbox_suggestions where status = 'open' and needs_reply`),
    rows(sql`select count(*)::int as n from purchase_invoice_reviews where status = 'pending'`),
    rows(sql`select d.doc_number, d.total_eur, d.due_date, c.name as contact from documents d left join contacts c on c.id = d.contact_id
      where d.kind = 'invoice' and d.status not in ('paid', 'void', 'draft') and d.due_date < current_date order by d.due_date limit 10`),
    listProposals(["ready", "review"], 14),
    recentAccountDecisions(1),
    recentLaborDecisions(1),
  ]);

  const sections: Briefing["sections"] = [];
  sections.push({ heading: "📅 Vandaag", lines: appointments.length
    ? appointments.map((a) => `${a.all_day ? "hele dag" : time(a.starts_at)} ${a.title}${a.location ? ` (${a.location})` : ""}`)
    : ["Geen afspraken."] });
  sections.push({ heading: "✅ Taken (vandaag en achterstallig)", lines: tasks.length
    ? tasks.map((t) => `${t.subject ?? "Taak"}${t.contact ? ` — ${t.contact}` : ""}`)
    : ["Niets openstaand."] });
  if (requests.length) sections.push({ heading: `📥 Nieuwe aanvragen (24 u): ${requests.length}`, lines: requests.map((r) => `${r.kind === "appointment" ? "Afspraak" : r.kind === "contact" ? "Contact" : "Offerte"}: ${r.name}${r.company ? ` (${r.company})` : ""}`) });
  if (proposals.length) sections.push({ heading: "🤖 Autopilot: wacht op jou", lines: proposals.map((p) => `${p.status === "ready" ? "Klaar om te versturen" : "Even kijken"}: offerte ${p.customer}${p.total ? ` ${formatEUR(p.total)}` : ""}${p.marginPct != null ? `, marge ${p.marginPct}%` : ""}`) });
  if (accounts.length) sections.push({ heading: "👤 Accounts (24 u)", lines: accounts.map((a) => `${a.approved ? "Automatisch goedgekeurd" : "Naar jou"}: ${a.name}${a.approved ? "" : ` — ${a.reasons.join(", ")}`}`) });
  if (labor.length) sections.push({ heading: "🧾 Urenfacturen (24 u)", lines: labor.map((l) => `${l.outcome === "approved" ? "Automatisch geboekt" : l.outcome === "returned" ? "Teruggestuurd (bedrag klopt niet)" : "Naar jou"}: ${l.reference ?? l.supplier}${l.amount != null ? ` ${formatEUR(l.amount)}` : ""}${l.outcome === "approved" ? ` — ${l.summary ?? ""}${l.holded ? `. ${l.holded}` : ""}` : ` — ${l.reasons.join(", ")}`}`) });
  const mailCount = Number(mails[0]?.n ?? 0);
  const invoiceCount = Number(invoices[0]?.n ?? 0);
  sections.push({ heading: "📬 Wacht op actie", lines: [
    `${mailCount} mail${mailCount === 1 ? "" : "s"} met een klaargezet antwoord`,
    `${invoiceCount} inkoopfactu${invoiceCount === 1 ? "ur" : "ren"} te keuren`,
  ] });
  if (overdue.length) sections.push({ heading: "💶 Facturen over de vervaldatum", lines: overdue.map((d) => `${d.doc_number} ${d.contact ?? ""} ${formatEUR(Number(d.total_eur ?? 0))} (vervallen ${d.due_date})`) });

  try {
    const { data } = await getLiveStatsCached("yesterday");
    if (data) {
      sections.push({ heading: "📣 Advertenties gisteren", lines: [
        `Bereik ${data.total.reach}, klikken ${data.total.clicks}, leads ${data.total.leads}, uitgegeven ${formatEUR(data.total.spend)}`,
        data.instagram.followers != null || data.facebook.followers != null
          ? `Volgers: Instagram ${data.instagram.followers ?? "?"}, Facebook ${data.facebook.followers ?? "?"}`
          : "",
      ].filter(Boolean) });
    }
  } catch {
    // advertentiecijfers zijn een extraatje
  }

  const day = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return { title: `Goedemorgen Nick — ${day}`, sections };
}

export function briefingText(b: Briefing): string {
  return [b.title, "", ...b.sections.flatMap((s) => [s.heading, ...s.lines.map((l) => `• ${l}`), ""])].join("\n").trim();
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendBriefing() {
  const b = await buildBriefing();
  const base = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "https://crm.habitat-one.com";
  const html = `<div style="font-family:Arial,sans-serif;color:#2a2520;font-size:14px;line-height:1.5">
<h2 style="color:#3a2a20;margin:0 0 12px">${esc(b.title)}</h2>
${b.sections.map((s) => `<h3 style="margin:16px 0 4px;font-size:15px">${esc(s.heading)}</h3><ul style="margin:0;padding-left:18px">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("\n")}
<p style="margin-top:20px"><a href="${base}/autopilot">Autopilot openen</a> · <a href="${base}/assistent">Assistent</a></p>
</div>`;
  const mail = await sendEmail({ to: OWNER, subject: b.title, html, text: briefingText(b), noCompanyBcc: true });
  return { emailed: mail.sent, sections: b.sections.length };
}
