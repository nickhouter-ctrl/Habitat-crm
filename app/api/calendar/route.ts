// iCal/ICS-feed van de CRM-agenda (afspraken) voor abonnement in Apple Agenda,
// Google Calendar, Outlook, enz. Eénrichting, alleen-lezen.
// Beveiligd met een geheim token in de URL (?token=...), want deze route valt
// buiten de login-middleware. Abonneer in Apple Agenda op:
//   webcal://<crm-domein>/api/calendar?token=<CALENDAR_FEED_TOKEN>
import { asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { appointments, contacts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545: regels max 75 octets — vouw langere regels met CRLF + spatie.
function fold(line: string): string {
  const out: string[] = [];
  let s = line;
  while (s.length > 73) {
    out.push(s.slice(0, 73));
    s = " " + s.slice(73);
  }
  out.push(s);
  return out.join("\r\n");
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const expected = process.env.CALENDAR_FEED_TOKEN;
  if (!expected) return new Response("Feed niet geconfigureerd", { status: 503 });
  if (!token || token !== expected) return new Response("Niet geautoriseerd", { status: 401 });

  // Afspraken van de laatste 90 dagen + alle toekomstige.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      location: appointments.location,
      notes: appointments.notes,
      status: appointments.status,
      updatedAt: appointments.updatedAt,
      contactName: contacts.name,
    })
    .from(appointments)
    .leftJoin(contacts, eq(appointments.contactId, contacts.id))
    .where(gte(appointments.startsAt, since))
    .orderBy(asc(appointments.startsAt));

  const stamp = icsDate(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Habitat One//CRM Agenda//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Habitat One — Agenda",
    "X-WR-TIMEZONE:Europe/Madrid",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const r of rows) {
    const start = new Date(r.startsAt);
    const end = r.endsAt ? new Date(r.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
    const summary = r.contactName ? `${r.title} — ${r.contactName}` : r.title;
    const descParts: string[] = [];
    if (r.contactName) descParts.push(`Contact: ${r.contactName}`);
    if (r.notes) descParts.push(r.notes);
    const status = r.status === "cancelled" ? "CANCELLED" : "CONFIRMED";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${r.id}@habitat-one-crm`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(fold(`SUMMARY:${esc(summary)}`));
    lines.push(`DTSTART:${icsDate(start)}`);
    lines.push(`DTEND:${icsDate(end)}`);
    if (r.location) lines.push(fold(`LOCATION:${esc(r.location)}`));
    if (descParts.length) lines.push(fold(`DESCRIPTION:${esc(descParts.join("\n"))}`));
    lines.push(`STATUS:${status}`);
    lines.push(`LAST-MODIFIED:${icsDate(new Date(r.updatedAt ?? r.startsAt))}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n") + "\r\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="habitat-one-agenda.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
