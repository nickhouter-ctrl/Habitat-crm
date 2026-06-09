import { and, asc, eq, gte, isNull } from "drizzle-orm";
import Link from "next/link";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Textarea,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { db } from "@/lib/db";
import { activities, appointments, contacts } from "@/lib/db/schema";

import {
  completeTask,
  createAppointment,
  createTask,
  deleteAppointment,
  deleteTask,
} from "./actions";

export const metadata = { title: "Agenda" };

const DAY_FMT = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" });
const TIME_FMT = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" });

type ApptRow = {
  id: string;
  title: string;
  startsAt: Date;
  location: string | null;
  notes: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
};
type TaskRow = {
  id: string;
  subject: string | null;
  body: string | null;
  dueAt: Date | null;
  contactId: string | null;
  contactName: string | null;
};

type Item =
  | { kind: "appt"; at: Date; data: ApptRow }
  | { kind: "task"; at: Date; data: TaskRow };

export default async function AgendaPage() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStr = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (lokale dag)

  const [apptRows, taskRows] = await Promise.all([
    db
      .select({
        id: appointments.id,
        title: appointments.title,
        startsAt: appointments.startsAt,
        location: appointments.location,
        notes: appointments.notes,
        contactId: appointments.contactId,
        contactName: contacts.name,
        contactPhone: contacts.phone,
      })
      .from(appointments)
      .leftJoin(contacts, eq(appointments.contactId, contacts.id))
      .where(gte(appointments.startsAt, startOfToday))
      .orderBy(asc(appointments.startsAt)),
    db
      .select({
        id: activities.id,
        subject: activities.subject,
        body: activities.body,
        dueAt: activities.dueAt,
        contactId: activities.contactId,
        contactName: contacts.name,
      })
      .from(activities)
      .leftJoin(contacts, eq(activities.contactId, contacts.id))
      .where(and(eq(activities.type, "task"), isNull(activities.completedAt)))
      .orderBy(asc(activities.dueAt)),
  ]);

  const overdueTasks = taskRows.filter((t) => t.dueAt && t.dueAt < startOfToday);
  const undatedTasks = taskRows.filter((t) => !t.dueAt);

  // Tijdlijn: afspraken + taken-met-deadline (vanaf vandaag), gegroepeerd per dag.
  const byDay = new Map<string, Item[]>();
  const push = (key: string, item: Item) => {
    const arr = byDay.get(key) ?? [];
    arr.push(item);
    byDay.set(key, arr);
  };
  for (const a of apptRows) push(a.startsAt.toISOString().slice(0, 10), { kind: "appt", at: a.startsAt, data: a });
  for (const t of taskRows) {
    if (t.dueAt && t.dueAt >= startOfToday) push(t.dueAt.toISOString().slice(0, 10), { kind: "task", at: t.dueAt, data: t });
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, list] of days) list.sort((a, b) => a.at.getTime() - b.at.getTime());

  const isEmpty = days.length === 0 && overdueTasks.length === 0 && undatedTasks.length === 0;

  return (
    <>
      <PageHeader
        title="Agenda"
        subtitle={`${apptRows.length} afspra${apptRows.length === 1 ? "ak" : "ken"} · ${taskRows.length} open ta${taskRows.length === 1 ? "ak" : "ken"}`}
      />

      {/* Snel toevoegen */}
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nieuwe afspraak</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createAppointment} className="space-y-3">
              <Field label="Titel" htmlFor="appt-title">
                <Input id="appt-title" name="title" required placeholder="bv. Showroombezoek Jan de Vries" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum" htmlFor="appt-date">
                  <Input id="appt-date" name="date" type="date" required defaultValue={todayStr} />
                </Field>
                <Field label="Tijd" htmlFor="appt-time">
                  <Input id="appt-time" name="time" type="time" defaultValue="09:00" />
                </Field>
              </div>
              <Field label="Locatie" htmlFor="appt-loc">
                <Input id="appt-loc" name="location" placeholder="bv. Showroom Jávea" />
              </Field>
              <Field label="Notitie" htmlFor="appt-notes">
                <Textarea id="appt-notes" name="notes" rows={2} />
              </Field>
              <SubmitButton pendingLabel="Toevoegen…">Afspraak toevoegen</SubmitButton>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nieuwe taak</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createTask} className="space-y-3">
              <Field label="Taak" htmlFor="task-subject">
                <Input id="task-subject" name="subject" required placeholder="bv. Klant terugbellen over offerte" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Deadline (optioneel)" htmlFor="task-date">
                  <Input id="task-date" name="date" type="date" />
                </Field>
                <Field label="Tijd" htmlFor="task-time">
                  <Input id="task-time" name="time" type="time" />
                </Field>
              </div>
              <Field label="Toelichting" htmlFor="task-body">
                <Textarea id="task-body" name="body" rows={2} />
              </Field>
              <SubmitButton pendingLabel="Toevoegen…">Taak toevoegen</SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {isEmpty ? (
        <EmptyState
          title="Niks gepland"
          description="Voeg hierboven een afspraak of taak toe — taken met een deadline verschijnen automatisch in de tijdlijn."
        />
      ) : (
        <div className="max-w-3xl space-y-6">
          {overdueTasks.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-danger">Te laat</h2>
              <div className="space-y-2">
                {overdueTasks.map((t) => (
                  <TaskCard key={t.id} task={t} overdue />
                ))}
              </div>
            </div>
          )}

          {days.map(([day, list]) => (
            <div key={day}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-muted">
                {DAY_FMT.format(new Date(`${day}T12:00:00`))}
              </h2>
              <div className="space-y-2">
                {list.map((item) =>
                  item.kind === "appt" ? (
                    <ApptCard key={`a-${item.data.id}`} appt={item.data} />
                  ) : (
                    <TaskCard key={`t-${item.data.id}`} task={item.data} />
                  ),
                )}
              </div>
            </div>
          ))}

          {undatedTasks.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted">Taken zonder datum</h2>
              <div className="space-y-2">
                {undatedTasks.map((t) => (
                  <TaskCard key={t.id} task={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ApptCard({ appt: a }: { appt: ApptRow }) {
  return (
    <Card className="flex items-start gap-4 p-4">
      <div className="w-12 shrink-0 text-center text-lg font-semibold tabular-nums">
        {TIME_FMT.format(a.startsAt)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{a.title}</p>
          <Badge tone="info">Afspraak</Badge>
        </div>
        {a.location && <p className="text-xs text-muted">{a.location}</p>}
        {a.notes && <p className="mt-1 whitespace-pre-line text-sm">{a.notes}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {a.contactId && (
            <Link href={`/contacts/${a.contactId}`} className="text-accent hover:underline">
              {a.contactName ?? "contact"}
            </Link>
          )}
          {a.contactPhone && (
            <a href={`tel:${a.contactPhone}`} className="text-muted hover:underline">
              {a.contactPhone}
            </a>
          )}
          <form action={deleteAppointment.bind(null, a.id)} className="ml-auto">
            <ConfirmSubmit message="Afspraak verwijderen?" className="text-muted hover:text-danger" pendingLabel="…">
              Verwijderen
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </Card>
  );
}

function TaskCard({ task: t, overdue = false }: { task: TaskRow; overdue?: boolean }) {
  return (
    <Card className={`flex items-start gap-3 p-4 ${overdue ? "border-danger/40" : ""}`}>
      <form action={completeTask.bind(null, t.id)} className="pt-0.5">
        <SubmitButton
          size="sm"
          variant="ghost"
          pendingLabel="…"
          className="size-6 rounded-full border p-0 text-xs hover:bg-success/10 hover:text-success"
          title="Afronden"
        >
          ✓
        </SubmitButton>
      </form>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{t.subject}</p>
          <Badge tone={overdue ? "danger" : "warning"}>Taak</Badge>
        </div>
        {t.body && <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{t.body}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {t.dueAt && (
            <span className={overdue ? "font-medium text-danger" : "text-muted"}>
              {DAY_FMT.format(t.dueAt)} · {TIME_FMT.format(t.dueAt)}
            </span>
          )}
          {t.contactId && (
            <Link href={`/contacts/${t.contactId}`} className="text-accent hover:underline">
              {t.contactName ?? "contact"}
            </Link>
          )}
          <form action={deleteTask.bind(null, t.id)} className="ml-auto">
            <ConfirmSubmit message="Taak verwijderen?" className="text-muted hover:text-danger" pendingLabel="…">
              Verwijderen
            </ConfirmSubmit>
          </form>
        </div>
      </div>
    </Card>
  );
}
