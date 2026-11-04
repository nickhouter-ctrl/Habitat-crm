/** Opt-in real Postgres test. Apple is mocked and ALL database changes roll back. */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: null as unknown, owner: "", apple: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/apple-calendar/client", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/apple-calendar/client")>(), appleClient: m.apple,
}));
vi.mock("@/lib/db", async () => {
  const real = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...real, db: new Proxy(real.db, { get(target, key) {
    const active = (m.current ?? target) as typeof real.db;
    if (key === "select" && m.current) return (...args: Parameters<typeof real.db.select>) => {
      const builder = active.select(...args), from = builder.from.bind(builder);
      builder.from = ((table: Parameters<typeof from>[0]) => {
        const query = from(table);
        if (table === appointments) {
          const where = query.where.bind(query);
          query.where = ((condition: Parameters<typeof where>[0]) => {
            if (typeof condition === "function") throw new Error("Unexpected fixture query");
            return where(and(condition, eq(appointments.createdBy, m.owner)));
          }) as typeof query.where;
        }
        return query;
      }) as typeof builder.from;
      return builder;
    };
    const value = Reflect.get(active, key); return typeof value === "function" ? value.bind(active) : value;
  } }) };
});
import { appleCalendarConnections as connections, appleCalendarEvents as mappings, appointments, users } from "../db/schema";
import { syncAppleCalendar } from "../apple-calendar/sync";
import { encryptPassword } from "../apple-calendar/security";
import { fromAppointment, parseEvent, serializeEvent } from "../apple-calendar/events";

const enabled = process.env.APPLE_CALENDAR_DB_TEST === "1";
afterAll(async () => { if (enabled) await (await vi.importActual<typeof import("@/lib/db")>("@/lib/db")).pgClient.end({ timeout: 1 }); });

it.skipIf(!enabled)("syncs both ways, retries, deletions, conflicts, lost listings and concurrent edits in real SQL", async () => {
  const real = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  const rollback = new Error("ROLLBACK_APPLE_CALENDAR"), owner = randomUUID(), id = randomUUID();
  m.owner = owner;
  const oldEffects = process.env.CRM_EXTERNAL_EFFECTS; delete process.env.CRM_EXTERNAL_EFFECTS;
  const calendarUrl = "https://p01-caldav.icloud.com/123/calendars/test/";
  const remote = new Map<string, { url: string; data: string; etag: string }>();
  let version = 0, omitListing = false, concurrentEdit = false;
  const put = vi.fn(async (url: string, _calendar: string, data: string, etag?: string) => {
    expect(etag ?? null).toBe(remote.get(url)?.etag ?? null);
    remote.set(url, { url, data, etag: `"${++version}"` });
  });
  const remove = vi.fn(async (url: string, _calendar: string, etag: string) => { expect(etag).toBe(remote.get(url)?.etag); remote.delete(url); });
  m.apple.mockResolvedValue({ client: {
    fetchCalendars: async () => [{ url: calendarUrl }],
    fetchCalendarObjects: async () => {
      if (concurrentEdit) {
        concurrentEdit = false;
        // An edit before the local snapshot must still be noticed.
        await (m.current as typeof real.db).update(appointments).set({ title: "Latest CRM edit" }).where(eq(appointments.id, id));
      }
      return omitListing ? [] : [...remote.values()];
    },
  }, get: async (url: string) => remote.get(url) ?? null, put, remove });
  try {
    await real.db.transaction(async tx => {
      m.current = tx;
      expect(await tx.select().from(connections)).toHaveLength(0); // Do not test against an active integration.
      await tx.insert(users).values({ id: owner, name: "Apple rollback fixture", email: `${owner}@example.invalid`, role: "admin" });
      await tx.insert(connections).values({ id: "team", ownerId: owner, appleAccount: "fixture@example.invalid", enabled: true, calendarUrl,
        encryptedPassword: encryptPassword("fixture-password", "fixture@example.invalid", process.env.AUTH_SECRET!) });
      const [original] = await tx.insert(appointments).values({ id, title: "CRM original", startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000), createdBy: owner, assigneeId: owner }).returning();
      expect((await syncAppleCalendar()).exported).toBe(1);
      expect(remote.size).toBe(1);
      await syncAppleCalendar(); expect(put).toHaveBeenCalledTimes(1);
      const url = [...remote.keys()][0];
      const changeApple = (title: string) => {
        const object = remote.get(url)!; const parsed = parseEvent(object.data);
        remote.set(url, { url, data: serializeEvent(parsed.uid, { ...parsed.value, title }), etag: `"${++version}"` });
      };
      changeApple("Edited on iPhone");
      expect((await syncAppleCalendar()).imported).toBe(1);
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0]).toMatchObject({ title: "Edited on iPhone", assigneeId: owner });
      await syncAppleCalendar(); expect(remote.size).toBe(1);
      omitListing = true;
      await syncAppleCalendar();
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0].status).toBe("scheduled");
      omitListing = false;
      // A moved/duplicated UID is not interpreted as deletion of the original.
      const renamed = calendarUrl + "renamed.ics", currentObject = remote.get(url)!;
      remote.set(renamed, { ...currentObject, url: renamed }); remote.delete(url);
      expect((await syncAppleCalendar()).issues).toBeGreaterThan(0);
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0].status).toBe("scheduled");
      remote.delete(renamed); remote.set(url, currentObject);
      await syncAppleCalendar();
      changeApple("Concurrent Apple edit"); concurrentEdit = true;
      expect((await syncAppleCalendar()).issues).toBe(1);
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0].title).toBe("Latest CRM edit");
      expect(parseEvent(remote.get(url)!.data).value.title).toBe("Concurrent Apple edit");
      await tx.update(mappings).set({ resolution: "apple" }).where(eq(mappings.appointmentId, id));
      await syncAppleCalendar();
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0].title).toBe("Concurrent Apple edit");
      remote.delete(url);
      await syncAppleCalendar();
      expect((await tx.select().from(appointments).where(eq(appointments.id, id)))[0].status).toBe("cancelled");
      await syncAppleCalendar(); expect(remote.size).toBe(0);
      await tx.update(appointments).set({ status: "scheduled" }).where(eq(appointments.id, id));
      await syncAppleCalendar(); expect(remote.size).toBe(1);
      await tx.delete(appointments).where(eq(appointments.id, id));
      await syncAppleCalendar(); expect(remote.size).toBe(0);
      await syncAppleCalendar(); expect(remote.size).toBe(0);
      // A phone-created item is imported once, with its mapping in the same transaction.
      const phoneUrl = calendarUrl + "phone.ics";
      remote.set(phoneUrl, { url: phoneUrl, data: serializeEvent("phone-created", { ...fromAppointment(original), title: "New from iPhone" }), etag: '"phone1"' });
      expect((await syncAppleCalendar()).imported).toBe(1);
      await syncAppleCalendar();
      const imported = await tx.select().from(appointments).where(eq(appointments.createdBy, owner));
      expect(imported).toHaveLength(1); expect(imported[0].title).toBe("New from iPhone");
      // The owner losing admin rights stops further remote access.
      await tx.update(users).set({ role: "sales" }).where(eq(users.id, owner));
      const before = m.apple.mock.calls.length;
      await expect(syncAppleCalendar()).rejects.toThrow("access");
      expect(m.apple).toHaveBeenCalledTimes(before);
      throw rollback;
    });
    throw new Error("Unexpected fixture commit");
  } catch (error) { if (error !== rollback) throw error; }
  finally { m.current = null; if (oldEffects === undefined) delete process.env.CRM_EXTERNAL_EFFECTS; else process.env.CRM_EXTERNAL_EFFECTS = oldEffects; }
  expect(await real.db.select().from(users).where(eq(users.id, owner))).toHaveLength(0);
}, 60000);
