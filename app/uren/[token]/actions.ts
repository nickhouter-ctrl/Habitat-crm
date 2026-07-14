"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { portalLinkForToken, portalT } from "@/lib/worker-portal";

export type LogHoursState = { ok?: string; error?: string } | null;

/**
 * Urenregel vanuit het portaal: de token bepaalt arbeider ÉN project, nooit de
 * client. Een ploegbaas kan met `crewName` optioneel de naam van één van zijn
 * jongens invullen — de regel blijft aan hem (workerId) hangen, tegen zijn tarief.
 */
export async function logHours(
  token: string,
  _prev: LogHoursState,
  formData: FormData,
): Promise<LogHoursState> {
  const ctx = await portalLinkForToken(token);
  if (!ctx) return { error: portalT(null).invalidLink };
  const { worker, project } = ctx;
  const t = portalT(worker.portalLang);

  const date = String(formData.get("date") ?? "").trim();
  const rawHours = String(formData.get("hours") ?? "").trim();
  const crewName = String(formData.get("crewName") ?? "").trim().slice(0, 80);
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: t.errDate };
  if (!rawHours) return { error: t.errHoursMissing };

  const hours = Number(rawHours.replace(",", "."));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 16) return { error: t.errHoursRange };

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  if (date > today) return { error: t.errFuture };
  if (date < monthAgo) return { error: t.errTooOld };

  await db.insert(timeEntries).values({
    projectId: project.id,
    workerId: worker.id,
    workerName: crewName || worker.name,
    date,
    hours: String(hours),
    hourlyCostEur: worker.hourlyCostEur != null ? String(worker.hourlyCostEur) : "0",
    paymentMethod: worker.defaultPaymentMethod,
    selfLoggedAt: new Date(),
    note: note || null,
  });

  revalidatePath(`/uren/${token}`);
  revalidatePath(`/projects/${project.id}`);
  return { ok: t.saved };
}

/**
 * Eigen portaal-regel verwijderen (vergissing hersteld) — alleen eigen regels
 * op dit project, via het portaal ingevoerd én hoogstens 7 dagen oud.
 */
export async function deleteOwnEntry(token: string, entryId: string): Promise<void> {
  const ctx = await portalLinkForToken(token);
  if (!ctx) return;
  await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.id, entryId),
        eq(timeEntries.workerId, ctx.worker.id),
        eq(timeEntries.projectId, ctx.project.id),
        isNotNull(timeEntries.selfLoggedAt),
        sql`${timeEntries.createdAt} > now() - interval '7 days'`,
      ),
    );
  revalidatePath(`/uren/${token}`);
  revalidatePath(`/projects/${ctx.project.id}`);
}
