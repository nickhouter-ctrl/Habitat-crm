import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { agendaDay } from "../agenda-dates";

const m = vi.hoisted(() => ({ guard: vi.fn(), where: vi.fn(), insert: vi.fn(), values: vi.fn(), conflict: vi.fn(), remove: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireModule: m.guard }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: m.where }) }),
  insert: m.insert,
  delete: m.remove,
} }));
import { setDailyTaskCompleted } from "@/app/(app)/_start/daily-actions";

const userId = "10000000-0000-4000-8000-000000000001";
const taskId = "20000000-0000-4000-8000-000000000002";
const day = "2026-10-06";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-06T10:00:00Z")); vi.resetAllMocks();
  m.guard.mockResolvedValue({ id: userId, role: "admin" });
  m.where.mockResolvedValue([{ id: taskId, userId, kind: "mail" }]);
  m.insert.mockReturnValue({ values: m.values });
  m.values.mockReturnValue({ onConflictDoNothing: m.conflict });
  m.conflict.mockResolvedValue(undefined);
  m.remove.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => vi.useRealTimers());

describe("daily task completion", () => {
  it("requires an authenticated writer before touching the database", async () => {
    m.guard.mockRejectedValue(new Error("denied"));
    await expect(setDailyTaskCompleted(taskId, day, true)).rejects.toThrow("denied");
    expect(m.where).not.toHaveBeenCalled(); expect(m.insert).not.toHaveBeenCalled();
  });
  it("scopes the task to the signed-in employee, including for an admin", async () => {
    await setDailyTaskCompleted(taskId, day, true);
    const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(m.where.mock.calls[0][0]);
    expect(query.sql).toContain('"user_id"');
    expect(query.params).toEqual([taskId, userId]);
    expect(m.values).toHaveBeenCalledWith({ taskId, day });
    expect(m.conflict).toHaveBeenCalledOnce();
  });
  it("rejects another employee's task without recording completion", async () => {
    m.where.mockResolvedValue([]);
    await expect(setDailyTaskCompleted(taskId, day, true)).rejects.toThrow("Geen toegang");
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("blocks financial checks when an assignee no longer has purchasing access", async () => {
    m.guard.mockResolvedValue({ id: userId, role: "marketing" });
    m.where.mockResolvedValue([{ id: taskId, userId, kind: "purchase_reviews" }]);
    await expect(setDailyTaskCompleted(taskId, day, true)).rejects.toThrow("Geen toegang");
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("does not let a stale page complete the next day and uses Madrid midnight", async () => {
    vi.setSystemTime(new Date("2026-10-06T22:01:00Z"));
    expect(agendaDay(new Date())).toBe("2026-10-07");
    await expect(setDailyTaskCompleted(taskId, day, true)).rejects.toThrow("Vernieuw");
    expect(m.where).not.toHaveBeenCalled();
    await setDailyTaskCompleted(taskId, "2026-10-07", true);
    expect(m.values).toHaveBeenCalledWith({ taskId, day: "2026-10-07" });
  });
  it("reopens only today's completion and refreshes both views", async () => {
    await setDailyTaskCompleted(taskId, day, false);
    const filter = m.remove.mock.results[0].value.where.mock.calls[0][0];
    expect(new PgDialect({ casing: "snake_case" }).sqlToQuery(filter).params).toEqual([taskId, day]);
    expect(m.insert).not.toHaveBeenCalled();
    expect(m.revalidate.mock.calls).toEqual([["/"], ["/agenda"]]);
  });
});
