"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireModule } from "@/lib/auth/guards";
import { magModule } from "@/lib/auth/modules";
import { db } from "@/lib/db";
import { staffDailyTasks, staffDailyTaskCompletions } from "@/lib/db/schema";
import { DAILY_TASKS } from "@/lib/daily-task-definitions";
import { agendaDay } from "@/lib/agenda-dates";

export async function setDailyTaskCompleted(id: string, day: string, completed: boolean) {
  const user = await requireModule("agenda");
  z.string().uuid().parse(id);
  z.boolean().parse(completed);
  // An old browser tab must not complete tomorrow's check by accident.
  if (day !== agendaDay(new Date())) throw new Error("Vernieuw de pagina voor de taken van vandaag.");
  const [task] = await db.select().from(staffDailyTasks)
    .where(and(eq(staffDailyTasks.id, id), eq(staffDailyTasks.userId, user.id)));
  if (!task || !magModule(user.role, DAILY_TASKS[task.kind].module)) throw new Error("Geen toegang tot deze taak.");
  if (completed) {
    await db.insert(staffDailyTaskCompletions).values({ taskId: task.id, day }).onConflictDoNothing();
  } else {
    await db.delete(staffDailyTaskCompletions).where(and(eq(staffDailyTaskCompletions.taskId, task.id), eq(staffDailyTaskCompletions.day, day)));
  }
  revalidatePath("/");
  revalidatePath("/agenda");
}
