import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { staffDailyTasks, staffDailyTaskCompletions, users } from "@/lib/db/schema";
import type { Toegang } from "@/lib/auth/access";
import { DAILY_TASKS } from "@/lib/daily-task-definitions";
import { magModule } from "@/lib/auth/modules";

/** Only admins can inspect another employee's daily checks. Module access is
 * checked for both the viewer and the assignee, including after role changes. */
export async function loadDailyTasks(access: Toegang, day: string, ownerId: string | null = access.id) {
  const scopedOwner = access.heeftCap("teambeheer") ? ownerId : access.id;
  const rows = await db.select({
    id: staffDailyTasks.id, kind: staffDailyTasks.kind, userId: staffDailyTasks.userId,
    name: users.name, role: users.role, completedAt: staffDailyTaskCompletions.completedAt,
  }).from(staffDailyTasks)
    .innerJoin(users, eq(users.id, staffDailyTasks.userId))
    .leftJoin(staffDailyTaskCompletions, and(eq(staffDailyTaskCompletions.taskId, staffDailyTasks.id), eq(staffDailyTaskCompletions.day, day)))
    .where(scopedOwner ? eq(staffDailyTasks.userId, scopedOwner) : undefined)
    .orderBy(asc(users.name), asc(staffDailyTasks.kind));
  return rows.filter(row => access.magModule(DAILY_TASKS[row.kind].module) && magModule(row.role, DAILY_TASKS[row.kind].module));
}

export type DailyTaskRow = Awaited<ReturnType<typeof loadDailyTasks>>[number];
