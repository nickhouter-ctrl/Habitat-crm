import { brandedEmail, escapeHtml } from "@/lib/email";
import { crmUrl } from "@/lib/crm-url";
import { dateLocale, isLocale, maakT } from "@/lib/i18n";
import { AGENDA_TIME_ZONE } from "@/lib/agenda-dates";

export type StaffAgendaItem = { id: string; kind: "task" | "appointment"; title: string; body: string | null; at: Date; contactId: string | null; contactName: string | null; location?: string | null; overdue?: boolean };
export type StaffMailContent = { kind: "followup_assignment" | "task_assignment" | "appointment_assignment" | "team_message" | "daily_agenda"; title?: string; body?: string | null; at?: Date | null; actorName?: string | null; contactId?: string | null; contactName?: string | null; messageId?: string; day?: string; items?: StaffAgendaItem[] };

export function staffNotificationEmail(content: StaffMailContent, recipient: { name: string | null; locale: string }) {
  const locale = isLocale(recipient.locale) ? recipient.locale : "nl", t = maakT(locale), base = crmUrl();
  const date = (at: Date) => at.toLocaleString(dateLocale(locale), { timeZone: AGENDA_TIME_ZONE, weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const day = content.day ? new Date(`${content.day}T12:00:00Z`).toLocaleDateString(dateLocale(locale), { day: "numeric", month: "long", year: "numeric" }) : "";
  let subject: string, intro: string, href: string, label: string;
  switch (content.kind) {
    case "followup_assignment": subject = t("Nieuwe opvolging toegewezen: {naam}", { naam: content.contactName ?? content.title ?? "" }); intro = t("Je bent nu verantwoordelijk voor de opvolging van deze klant."); href = `/opvolging/${content.contactId}`; label = t("Open het opvolgdossier"); break;
    case "task_assignment": subject = t("Nieuwe taak voor jou: {titel}", { titel: content.title ?? "" }); intro = t("Er is een taak aan jou toegewezen."); href = "/agenda"; label = t("Open je agenda"); break;
    case "appointment_assignment": subject = t("Nieuwe afspraak voor jou: {titel}", { titel: content.title ?? "" }); intro = t("Er is een afspraak aan jou toegewezen."); href = "/agenda"; label = t("Open je agenda"); break;
    case "team_message": subject = t("Bericht van {naam}: {titel}", { naam: content.actorName ?? t("Medewerker"), titel: content.title ?? "" }); intro = t("Je hebt een nieuw teambericht ontvangen."); href = `/teamberichten?bericht=${content.messageId}`; label = t("Lees het teambericht"); break;
    case "daily_agenda": subject = t("Jouw agenda voor {datum}", { datum: day }); intro = t("Dit staat voor jou klaar: afspraken van vandaag, te volgen taken en achterstallige acties."); href = `/agenda?date=${content.day}&owner=mine`; label = t("Open je agenda"); break;
  }
  const lines = [recipient.name ? t("Hallo {naam},", { naam: recipient.name }) : t("Hallo,"), intro];
  const parts = [`<p>${escapeHtml(lines[0])}</p><p>${escapeHtml(intro)}</p>`];
  if (content.actorName && content.kind !== "team_message") { const actor = t("Toegewezen door {naam}", { naam: content.actorName }); parts.push(`<p style="color:#7a6f63;font-size:13px">${escapeHtml(actor)}</p>`); lines.push(actor); }
  if (content.title) { parts.push(`<h2 style="font-size:18px">${escapeHtml(content.title)}</h2>`); lines.push(content.title); }
  if (content.contactName) { parts.push(`<p><strong>${escapeHtml(t("Klant"))}:</strong> ${escapeHtml(content.contactName)}</p>`); lines.push(`${t("Klant")}: ${content.contactName}`); }
  if (content.at) { parts.push(`<p><strong>${escapeHtml(t("Wanneer"))}:</strong> ${escapeHtml(date(content.at))}</p>`); lines.push(date(content.at)); }
  if (content.body) { parts.push(`<p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(content.body)}</p>`); lines.push(content.body); }
  for (const item of content.items ?? []) {
    const kind = t(item.kind === "appointment" ? "Afspraak" : item.overdue ? "Achterstallige taak" : "Taak");
    const link = item.contactId ? `/opvolging/${item.contactId}` : `/agenda?date=${content.day}&owner=mine`;
    parts.push(`<div style="margin:12px 0;padding:14px;border:1px solid #e8dfd0;border-radius:8px"><p style="margin:0;color:${item.overdue ? "#a4372b" : "#7a6f63"};font-size:12px">${escapeHtml(kind)} · ${escapeHtml(date(item.at))}</p><p style="margin:6px 0"><strong>${escapeHtml(item.title)}</strong>${item.contactName ? ` · ${escapeHtml(item.contactName)}` : ""}</p>${item.body ? `<p style="margin:6px 0;white-space:pre-wrap">${escapeHtml(item.body)}</p>` : ""}${item.location ? `<p>${escapeHtml(item.location)}</p>` : ""}<a href="${base}${link}">${escapeHtml(t("Bekijken"))}</a></div>`);
    lines.push(`\n${kind} · ${date(item.at)}\n${item.title}${item.contactName ? ` · ${item.contactName}` : ""}${item.body ? `\n${item.body}` : ""}${item.location ? `\n${item.location}` : ""}\n${base}${link}`);
  }
  parts.push(`<p style="margin-top:22px"><a href="${base}${href}" style="display:inline-block;background:#3a2a20;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">${escapeHtml(label)}</a></p>`);
  lines.push(`\n${label}: ${base}${href}`);
  if (content.kind === "team_message" && content.contactId) { parts.push(`<p><a href="${base}/opvolging/${content.contactId}">${escapeHtml(t("Open het klantdossier"))}</a></p>`); lines.push(`${base}/opvolging/${content.contactId}`); }
  return { subject: subject.replace(/[\r\n]/g, " "), html: brandedEmail(parts.join("")), text: lines.join("\n\n") };
}
