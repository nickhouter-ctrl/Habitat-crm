import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { portalLinkForToken, portalT } from "@/lib/worker-portal";
import { WorkerHoursForm } from "@/components/worker-hours-form";
import { deleteOwnEntry } from "./actions";

export const dynamic = "force-dynamic";

/** Projectspecifieke metadata → nette linkpreview in WhatsApp (titel + kaart). */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await portalLinkForToken(token).catch(() => null);
  if (!ctx) return { title: "Uren — Habitat One" };
  const t = portalT(ctx.worker.portalLang);
  const title = `${t.hours} — ${ctx.project.name}`;
  const description =
    ctx.worker.portalLang === "nl"
      ? `Vul hier je gewerkte uren in voor ${ctx.project.name}.`
      : ctx.worker.portalLang === "en"
        ? `Log your hours for ${ctx.project.name} here.`
        : `Apunta aquí tus horas de ${ctx.project.name}.`;
  return {
    title,
    description,
    openGraph: { title: `Habitat One — ${title}`, description },
  };
}

/** Maandag van de week waar `d` (YYYY-MM-DD) in valt. */
function mondayOf(d: string): string {
  const date = new Date(`${d}T12:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7; // ma=0 … zo=6
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

export default async function UrenPortaalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await portalLinkForToken(token);

  if (!ctx) {
    // Taal onbekend zonder geldige link — toon de melding meertalig.
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

  const { worker, project } = ctx;
  const t = portalT(worker.portalLang);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekStart = mondayOf(today);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const fiveWeeksAgo = new Date(now.getTime() - 35 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Alleen de eigen uren op dít project — één link = één project.
  const recent = await db
    .select({
      id: timeEntries.id,
      date: timeEntries.date,
      hours: timeEntries.hours,
      note: timeEntries.note,
      workerName: timeEntries.workerName,
      selfLoggedAt: timeEntries.selfLoggedAt,
      approvedAt: timeEntries.approvedAt,
      createdAt: timeEntries.createdAt,
      hourlyCostEur: timeEntries.hourlyCostEur,
      purchaseOrderId: timeEntries.purchaseOrderId,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workerId, worker.id),
        eq(timeEntries.projectId, project.id),
        gte(timeEntries.date, fiveWeeksAgo),
      ),
    )
    .orderBy(desc(timeEntries.date), desc(timeEntries.createdAt));

  // Weektotalen (ma-zo) van de eigen portaal-uren — voor de weekfactuur van de
  // bouwer: uren + bedrag ex btw, en of ze al aan een factuur gekoppeld zijn.
  const weekAgg = new Map<string, { hours: number; amount: number; open: number; openAmount: number }>();
  for (const e of recent) {
    if (!e.selfLoggedAt) continue;
    const wk = mondayOf(e.date);
    const agg = weekAgg.get(wk) ?? { hours: 0, amount: 0, open: 0, openAmount: 0 };
    const h = Number(e.hours);
    const amt = h * Number(e.hourlyCostEur ?? 0);
    agg.hours += h;
    agg.amount += amt;
    if (!e.purchaseOrderId) {
      agg.open += h;
      agg.openAmount += amt;
    }
    weekAgg.set(wk, agg);
  }
  const weekList = [...weekAgg.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5);
  const eur = (n: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);

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
          <h1 className="text-2xl font-semibold text-stone-800">
            {t.hello} {firstName} 👋
          </h1>
          <p className="mt-1 text-base font-medium text-stone-700">{project.name}</p>
          <p className="mt-1 text-sm text-stone-500">
            {t.thisWeek}:{" "}
            <span className="font-semibold text-stone-700">
              {weekHours % 1 === 0 ? weekHours : weekHours.toFixed(2)} {t.hoursUnit}
            </span>
          </p>
        </div>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-stone-800">{t.formTitle}</h2>
          <WorkerHoursForm token={token} today={today} t={t} />
        </section>

        {weekList.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-stone-800">{t.weekTotals}</h2>
            <p className="mb-3 text-xs text-stone-400">{t.weekTotalsHint}</p>
            <ul className="divide-y divide-stone-100">
              {weekList.map(([wk, agg]) => {
                const [, m, d] = wk.split("-");
                const fullyInvoiced = agg.open === 0;
                return (
                  <li key={wk} className="flex items-center gap-3 py-2.5">
                    <span className="w-20 shrink-0 text-sm text-stone-500">
                      {t.weekWord} {d}/{m}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-stone-700">
                      {agg.hours % 1 === 0 ? agg.hours : agg.hours.toFixed(2)} {t.hoursUnit}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-800">
                      {eur(agg.amount)}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        fullyInvoiced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {fullyInvoiced ? `✓ ${t.invoiced}` : `${t.toInvoice}: ${eur(agg.openAmount)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-stone-800">{t.recentTitle}</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-stone-500">{t.empty}</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.filter((e) => e.date >= twoWeeksAgo).map((e) => {
                const dayName = t.days[new Date(`${e.date}T12:00:00Z`).getUTCDay()];
                const [, m, d] = e.date.split("-");
                const crewLabel = e.workerName && e.workerName !== worker.name ? e.workerName : null;
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
                      {crewLabel ?? "—"}
                      {e.note ? <span className="text-stone-400"> · {e.note}</span> : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-stone-800">
                      {e.selfLoggedAt && !e.approvedAt ? "⏳ " : ""}
                      {Number(e.hours) % 1 === 0 ? Number(e.hours) : e.hours}
                      {t.hoursShort}
                    </span>
                    {removable && (
                      <form action={deleteOwnEntry.bind(null, token, e.id)}>
                        <button
                          type="submit"
                          aria-label={t.remove}
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

        <p className="text-center text-xs text-stone-400">{t.footer}</p>
      </div>
    </main>
  );
}
