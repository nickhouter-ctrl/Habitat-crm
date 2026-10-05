import { datumTaal } from "@/lib/i18n/server";
import { tekst as uiTranslation } from '@/lib/i18n/server';
/**
 * "Mijn taken" op de startpagina: open taken die aan de ingelogde gebruiker
 * zijn toegewezen (of eigen taken zonder assignee), plus een compacte vorm om
 * direct een taak toe te wijzen. Afvinken werkt inline.
 */
import Link from "next/link";

import { tekst } from "@/lib/i18n/server";

import { completeTask, createTask } from "@/app/(app)/agenda/actions";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";
import { ActionDialog } from "@/components/action-dialog";
import { agendaDay } from "@/lib/agenda-dates";



export interface MijnTaak {
  id: string;
  subject: string | null;
  dueAt: Date | null;
  priority: "hoog" | "middel" | "laag";
  authorName: string | null;
  isVanAnder: boolean;
}

export async function MijnTaken({
  taken,
  teamleden,
  readOnly = false,
}: {
  taken: MijnTaak[];
  teamleden: { id: string; name: string | null; email: string }[];
  readOnly?: boolean;
}) {
  const uiDateLocale = await datumTaal();
  const DAG_FMT = new Intl.DateTimeFormat(uiDateLocale, { weekday: "short", day: "numeric", month: "short" });
  const uiT = await uiTranslation();
  const t = await tekst();
  const nu = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Mijn taken")}</CardTitle>
        <Link href="/agenda" className="text-xs text-accent hover:underline">
          {t("Agenda")}
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {taken.length === 0 && <p className="py-1 text-sm text-muted">{t("Geen open taken — lekker bezig.")} ✓</p>}
        {taken.map((taak) => {
          const teLaat = !!taak.dueAt && taak.dueAt < nu;
          return (
            <div key={taak.id} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-background">
              {!readOnly && (
                <form action={completeTask.bind(null, taak.id)}>
                  <SubmitButton
                    size="sm"
                    variant="ghost"
                    pendingLabel="…"
                    className="size-6 rounded-full border p-0 text-xs hover:bg-success/10 hover:text-success"
                    title={t("Afronden")}
                  >
                    ✓
                  </SubmitButton>
                </form>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{taak.subject}</span>
              {taak.priority === "hoog" && <Badge tone="danger">{t("hoog")}</Badge>}
              {taak.isVanAnder && taak.authorName && (
                <span className="hidden text-xs text-muted sm:inline">{t("van {wie}", { wie: taak.authorName })}</span>
              )}
              {taak.dueAt && (
                <span className={`shrink-0 text-xs ${teLaat ? "font-medium text-danger" : "text-muted"}`}>
                  {DAG_FMT.format(taak.dueAt)}
                </span>
              )}
            </div>
          );
        })}

        {!readOnly && <div className="border-t pt-4"><ActionDialog title={t("Nieuwe taak")}>
          <form action={createTask} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium">{t("Wat moet er gebeuren?")}<Input name="subject" required placeholder={t("Nieuwe taak…")} /></label>
            <label className="grid gap-1.5 text-sm font-medium">{t("Verantwoordelijke")}<Select name="assigneeId" defaultValue="">
              <option value="">{t("Mijzelf")}</option>
              {teamleden.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </Select></label>
            <label className="grid gap-1.5 text-sm font-medium">{t("Deadline")}<Input name="date" type="date" defaultValue={agendaDay(new Date())}/></label>
            <details><summary className="cursor-pointer text-sm text-muted">{t("Meer opties")}</summary><label className="mt-3 grid gap-1.5 text-sm font-medium">{t("Prioriteit")}<Select name="priority" defaultValue="middel">
              <option value="hoog">{t("Hoog")}</option>
              <option value="middel">{t("Middel")}</option>
              <option value="laag">{t("Laag")}</option>
            </Select></label></details>
            <SubmitButton size="sm" pendingLabel="…">
              {uiT("Toevoegen")} </SubmitButton>
          </form>
        </ActionDialog></div>}
      </CardContent>
    </Card>
  );
}
