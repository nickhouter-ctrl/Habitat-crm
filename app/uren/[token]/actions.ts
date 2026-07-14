"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { projects, timeEntries } from "@/lib/db/schema";
import { workerForToken } from "@/lib/worker-portal";

const logSchema = z.object({
  projectId: z.string().uuid("Kies een project / Elige un proyecto"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ontbreekt / Falta la fecha"),
  hours: z.string().trim().min(1, "Vul uren in / Rellena las horas"),
  note: z.string().trim().max(500).optional(),
});

export type LogHoursState = { ok?: string; error?: string } | null;

/** Urenregel vanuit het portaal: token bepaalt de arbeider, nooit de client. */
export async function logHours(
  token: string,
  _prev: LogHoursState,
  formData: FormData,
): Promise<LogHoursState> {
  const worker = await workerForToken(token);
  if (!worker) return { error: "Deze link is niet (meer) geldig. / Este enlace ya no es válido." };

  const parsed = logSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const hours = Number(d.hours.replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) {
    return { error: "Uren moeten tussen 0 en 16 liggen. / Las horas deben estar entre 0 y 16." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (d.date > today) return { error: "Datum kan niet in de toekomst liggen. / La fecha no puede ser futura." };
  if (d.date < monthAgo) return { error: "Datum te lang geleden — overleg met kantoor. / Fecha demasiado antigua — consulta con la oficina." };

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, d.projectId), eq(projects.status, "active")),
    columns: { id: true },
  });
  if (!project) return { error: "Project niet gevonden. / Proyecto no encontrado." };

  await db.insert(timeEntries).values({
    projectId: d.projectId,
    workerId: worker.id,
    workerName: worker.name,
    date: d.date,
    hours: String(hours),
    hourlyCostEur: worker.hourlyCostEur != null ? String(worker.hourlyCostEur) : "0",
    paymentMethod: worker.defaultPaymentMethod,
    selfLoggedAt: new Date(),
    note: d.note?.trim() ? d.note.trim() : null,
  });

  revalidatePath(`/uren/${token}`);
  revalidatePath(`/projects/${d.projectId}`);
  return { ok: "Uren opgeslagen. / Horas guardadas." };
}

/**
 * Eigen portaal-regel verwijderen (vergissing hersteld) — alleen eigen regels
 * die via het portaal zijn ingevoerd én hoogstens 7 dagen oud zijn.
 */
export async function deleteOwnEntry(token: string, entryId: string): Promise<void> {
  const worker = await workerForToken(token);
  if (!worker) return;
  const [removed] = await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.id, entryId),
        eq(timeEntries.workerId, worker.id),
        isNotNull(timeEntries.selfLoggedAt),
        sql`${timeEntries.createdAt} > now() - interval '7 days'`,
      ),
    )
    .returning({ projectId: timeEntries.projectId });
  revalidatePath(`/uren/${token}`);
  if (removed) revalidatePath(`/projects/${removed.projectId}`);
}
