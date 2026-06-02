import { asc, eq, gte } from "drizzle-orm";
import Link from "next/link";

import { Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { appointments, contacts } from "@/lib/db/schema";

export const metadata = { title: "Agenda" };

const DAY_FMT = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const TIME_FMT = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });

export default async function AgendaPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      id: appointments.id,
      title: appointments.title,
      startsAt: appointments.startsAt,
      location: appointments.location,
      notes: appointments.notes,
      status: appointments.status,
      contactId: appointments.contactId,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
    .from(appointments)
    .leftJoin(contacts, eq(appointments.contactId, contacts.id))
    .where(gte(appointments.startsAt, startOfToday))
    .orderBy(asc(appointments.startsAt));

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.startsAt.toISOString().slice(0, 10);
    const arr = byDay.get(key) ?? ([] as typeof rows);
    arr.push(r);
    byDay.set(key, arr);
  }
  const days = [...byDay.entries()];

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={`${rows.length} komende afspra${rows.length === 1 ? "ak" : "ken"}`}
      />

      {days.length === 0 ? (
        <EmptyState
          title="Geen komende afspraken"
          description="Afspraken die je vanuit een aanvraag inplant, verschijnen hier."
        />
      ) : (
        <div className="max-w-3xl space-y-6">
          {days.map(([day, list]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-muted">
                {DAY_FMT.format(new Date(`${day}T12:00:00`))}
              </h2>
              <div className="space-y-2">
                {list.map((a) => (
                  <Card key={a.id} className="flex items-start gap-4 p-4">
                    <div className="w-12 shrink-0 text-center text-lg font-semibold tabular-nums">
                      {TIME_FMT.format(a.startsAt)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.title}</p>
                      {a.location && <p className="text-xs text-muted">{a.location}</p>}
                      {a.notes && <p className="mt-1 whitespace-pre-line text-sm">{a.notes}</p>}
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        {a.contactId && (
                          <Link
                            href={`/contacts/${a.contactId}`}
                            className="text-accent hover:underline"
                          >
                            {a.contactName ?? "contact"}
                          </Link>
                        )}
                        {a.contactPhone && (
                          <a href={`tel:${a.contactPhone}`} className="text-muted hover:underline">
                            {a.contactPhone}
                          </a>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
