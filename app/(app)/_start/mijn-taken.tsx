/**
 * "Mijn taken" op de startpagina: open taken die aan de ingelogde gebruiker
 * zijn toegewezen (of eigen taken zonder assignee), plus een compacte vorm om
 * direct een taak toe te wijzen. Afvinken werkt inline.
 */
import Link from "next/link";

import { completeTask, createTask } from "@/app/(app)/agenda/actions";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui";

const DAG_FMT = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

export interface MijnTaak {
  id: string;
  subject: string | null;
  dueAt: Date | null;
  priority: "hoog" | "middel" | "laag";
  authorName: string | null;
  isVanAnder: boolean;
}

export function MijnTaken({
  taken,
  teamleden,
  readOnly = false,
}: {
  taken: MijnTaak[];
  teamleden: { id: string; name: string | null; email: string }[];
  readOnly?: boolean;
}) {
  const nu = new Date();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mijn taken</CardTitle>
        <Link href="/agenda" className="text-xs text-accent hover:underline">
          Agenda
        </Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {taken.length === 0 && <p className="py-1 text-sm text-muted">Geen open taken — lekker bezig. ✓</p>}
        {taken.map((t) => {
          const teLaat = !!t.dueAt && t.dueAt < nu;
          return (
            <div key={t.id} className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-background">
              {!readOnly && (
                <form action={completeTask.bind(null, t.id)}>
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
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{t.subject}</span>
              {t.priority === "hoog" && <Badge tone="danger">hoog</Badge>}
              {t.isVanAnder && t.authorName && (
                <span className="hidden text-xs text-muted sm:inline">van {t.authorName}</span>
              )}
              {t.dueAt && (
                <span className={`shrink-0 text-xs ${teLaat ? "font-medium text-danger" : "text-muted"}`}>
                  {DAG_FMT.format(t.dueAt)}
                </span>
              )}
            </div>
          );
        })}

        {!readOnly && (
          <form action={createTask} className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <Input name="subject" required placeholder="Nieuwe taak…" className="min-w-40 flex-1" />
            <Select name="assigneeId" defaultValue="" className="w-auto" title="Toewijzen aan">
              <option value="">Mijzelf</option>
              {teamleden.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ?? u.email}
                </option>
              ))}
            </Select>
            <Select name="priority" defaultValue="middel" className="w-auto" title="Prioriteit">
              <option value="hoog">Hoog</option>
              <option value="middel">Middel</option>
              <option value="laag">Laag</option>
            </Select>
            <Input name="date" type="date" className="w-auto" title="Deadline" />
            <SubmitButton size="sm" pendingLabel="…">
              Toevoegen
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
