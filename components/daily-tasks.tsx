import Link from "next/link";
import { Mail, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { agendaDay } from "@/lib/agenda-dates";
import { tekst } from "@/lib/i18n/server";
import { DAILY_TASKS } from "@/lib/daily-task-definitions";
import type { DailyTaskRow } from "@/lib/daily-tasks";
import { setDailyTaskCompleted } from "@/app/(app)/_start/daily-actions";

export async function DailyTasks({ tasks, day, userId, readOnly = false }: {
  tasks: DailyTaskRow[]; day: string; userId: string; readOnly?: boolean;
}) {
  const t = await tekst();
  if (!tasks.length) return null;
  const isToday = day === agendaDay(new Date());
  const open = tasks.filter(task => !task.completedAt).length;
  return <Card className="border-accent/30" data-testid="daily-tasks">
    <CardHeader><div><CardTitle>{t("Dagelijkse taken")}</CardTitle><p className="mt-1 text-xs text-muted">{t("Elke dag opnieuw klaar. Vink af zodra je de controle hebt gedaan.")}</p></div><Badge className="shrink-0 whitespace-nowrap" tone={open ? "warning" : "success"}>{open ? t("{n} open", { n: open }) : t("Afgerond")}</Badge></CardHeader>
    <CardContent className="divide-y">
      {tasks.map(task => {
        const definition = DAILY_TASKS[task.kind], Icon = task.kind === "mail" ? Mail : Receipt;
        return <div key={task.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
          <Icon size={18} className={task.completedAt ? "text-success" : "text-accent"}/>
          <div className="min-w-0 flex-1"><Link href={definition.href} className="text-sm font-semibold hover:text-accent hover:underline">{t(definition.title)} →</Link><p className="mt-1 text-xs text-muted">{task.name} · {t(task.completedAt ? (isToday ? "Vandaag gedaan" : "Afgerond") : "Dagelijks")}</p></div>
          {!readOnly && isToday && task.userId === userId && <form action={setDailyTaskCompleted.bind(null, task.id, day, !task.completedAt)}><SubmitButton size="sm" variant={task.completedAt ? "ghost" : "secondary"} pendingLabel="…" aria-label={`${t(task.completedAt ? "Heropenen" : "Vandaag gedaan")}: ${t(definition.title)}`}>{t(task.completedAt ? "Heropenen" : "Vandaag gedaan")}</SubmitButton></form>}
        </div>;
      })}
    </CardContent>
  </Card>;
}
