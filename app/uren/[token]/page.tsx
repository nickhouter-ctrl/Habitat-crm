import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects, timeEntries } from "@/lib/db/schema";
import { workerForToken } from "@/lib/worker-portal";
import { WorkerHoursForm } from "@/components/worker-hours-form";
import { deleteOwnEntry } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Uren — Habitat One" };

/** Maandag van de week waar `d` (YYYY-MM-DD) in valt. */
function mondayOf(d: string): string {
  const date = new Date(`${d}T12:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7; // ma=0 … zo=6
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

const DAY_NL = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export default async function UrenPortaalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const worker = await workerForToken(token);

  if (!worker) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-16">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-6 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-stone-400">Habitat One</p>
          <h1 className="text-xl font-semibold text-stone-800">Link niet geldig / Enlace no válido</h1>
          <p className="mt-3 text-sm text-stone-500">
            Vraag kantoor om een nieuwe link. / Pide un enlace nuevo a la oficina.
          </p>
        </div>
      </main>
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekStart = mondayOf(today);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [activeProjects, recent] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(projects.name),
    db
      .select({
        id: timeEntries.id,
        date: timeEntries.date,
        hours: timeEntries.hours,
        note: timeEntries.note,
        selfLoggedAt: timeEntries.selfLoggedAt,
        createdAt: timeEntries.createdAt,
        projectName: projects.name,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(projects.id, timeEntries.projectId))
      .where(and(eq(timeEntries.workerId, worker.id), gte(timeEntries.date, twoWeeksAgo)))
      .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt)),
  ]);

  const weekHours = recent
    .filter((e) => e.date >= weekStart)
    .reduce((s, e) => s + Number(e.hours), 0);
  const weekAgoMs = now.getTime() - 7 * 24 * 3600 * 1000;
  const firstName = worker.name.split(" ")[0];

  return (
    <main className="min-h-screen bg-stone-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md space-y-5">
        <div className="text-center">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-stone-400">Habitat One</p>
          <h1 className="text-2xl font-semibold text-stone-800">Hola {firstName} 👋</h1>
          <p className="mt-1 text-sm text-stone-500">
            Deze week / Esta semana:{" "}
            <span className="font-semibold text-stone-700">{weekHours % 1 === 0 ? weekHours : weekHours.toFixed(2)} uur</span>
          </p>
        </div>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-stone-800">Uren invullen / Apuntar horas</h2>
          <WorkerHoursForm token={token} projects={activeProjects} today={today} />
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-stone-800">
            Laatste 2 weken / Últimas 2 semanas
          </h2>
          {recent.length === 0 ? (
            <p className="text-sm text-stone-500">Nog niets ingevuld. / Aún no hay horas.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((e) => {
                const dayName = DAY_NL[new Date(`${e.date}T12:00:00Z`).getUTCDay()];
                const [, m, d] = e.date.split("-");
                const removable =
                  e.selfLoggedAt != null &&
                  e.createdAt != null &&
                  new Date(e.createdAt).getTime() > weekAgoMs;
                return (
                  <li key={e.id} className="flex items-center gap-3 py-2.5">
                    <span className="w-14 shrink-0 text-sm text-stone-500">
                      {dayName} {d}/{m}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-stone-700">
                      {e.projectName ?? "—"}
                      {e.note ? <span className="text-stone-400"> · {e.note}</span> : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-800">
                      {Number(e.hours) % 1 === 0 ? Number(e.hours) : e.hours}u
                    </span>
                    {removable && (
                      <form action={deleteOwnEntry.bind(null, token, e.id)}>
                        <button
                          type="submit"
                          aria-label="Verwijderen / Eliminar"
                          className="rounded-lg px-2 py-1 text-stone-400 active:bg-stone-100"
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-center text-xs text-stone-400">
          Vragen? Bel kantoor. / ¿Preguntas? Llama a la oficina.
        </p>
      </div>
    </main>
  );
}
