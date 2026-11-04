import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { appleCalendarConnections as connections, appleCalendarEvents as mappings, appointments, users } from "@/lib/db/schema";
import { heeftCap, magModule } from "@/lib/auth/modules";
import { appleClient, AppleCalendarError } from "./client";
import { appleUrl, decryptPassword, encryptPassword, eventUrl } from "./security";
import { type CalendarEvent, eventHash, fromAppointment, parseEvent, serializeEvent, syncDecision } from "./events";

export const CALENDAR_NAME = "Habitat One CRM";
const secret = () => process.env.AUTH_SECRET ?? "";
const activeLock = () => or(isNull(connections.lockUntil), lt(connections.lockUntil, new Date()));

async function lease() {
  const token = randomUUID();
  const [row] = await db.update(connections).set({ lockToken: token, lockUntil: new Date(Date.now() + 180_000) })
    .where(and(eq(connections.id, "team"), activeLock())).returning();
  if (!row) throw new AppleCalendarError("busy");
  return { row, token };
}
async function release(token: string) {
  await db.update(connections).set({ lockToken: null, lockUntil: null }).where(and(eq(connections.id, "team"), eq(connections.lockToken, token)));
}
async function assertOwner(ownerId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { role: true } });
  if (!user || !heeftCap(user.role, "teambeheer") || !magModule(user.role, "agenda")) throw new AppleCalendarError("access");
}

/** Called only after the settings form's explicit shared-calendar consent. */
export async function connectApple(ownerId: string, account: string, password: string) {
  await assertOwner(ownerId);
  const encryptedPassword = encryptPassword(password, account, secret());
  const existing = await db.query.appleCalendarConnections.findFirst({ where: eq(connections.id, "team") });
  if (existing && existing.appleAccount !== account) throw new AppleCalendarError("different-account");
  // A mistyped account must not reserve the shared connection permanently.
  const { client } = await appleClient(account, password, Date.now() + 60_000);
  // Reserve a stable private collection path before making remote changes (retry-safe).
  await db.insert(connections).values({ id: "team", ownerId, appleAccount: account,
    calendarUrl: "https://caldav.icloud.com/", enabled: false }).onConflictDoNothing();
  const { row, token } = await lease();
  try {
    if (row.appleAccount !== account) throw new AppleCalendarError("different-account");
    const home = client.account?.homeUrl;
    if (!home) throw new AppleCalendarError("unavailable");
    appleUrl(home);
    const calendarUrl = row.calendarUrl === "https://caldav.icloud.com/"
      ? new URL(`habitat-one-crm-${row.ownerId}/`, home.endsWith("/") ? home : home + "/").href : row.calendarUrl;
    appleUrl(calendarUrl);
    let calendars = await client.fetchCalendars();
    if (!calendars.some(c => c.url === calendarUrl)) {
      if (row.lastSyncedAt) throw new AppleCalendarError("calendar-missing");
      const result = await client.makeCalendar({ url: calendarUrl, props: {
        "d:displayname": CALENDAR_NAME,
        "c:supported-calendar-component-set": { "c:comp": { _attributes: { name: "VEVENT" } } },
      } });
      if (result.some(r => r.status >= 400)) throw new AppleCalendarError("unavailable");
      calendars = await client.fetchCalendars();
    }
    if (!calendars.some(c => c.url === calendarUrl)) throw new AppleCalendarError("calendar-missing");
    await db.update(connections).set({ ownerId, encryptedPassword, calendarUrl, enabled: true, lastError: null })
      .where(and(eq(connections.id, "team"), eq(connections.lockToken, token)));
    console.info("[apple-calendar] connected", { actorId: ownerId });
  } finally { await release(token); }
}

export async function disconnectApple(actorId: string) {
  await assertOwner(actorId);
  const { token } = await lease();
  try {
    await db.update(connections).set({ enabled: false, encryptedPassword: null, lastError: null })
      .where(and(eq(connections.id, "team"), eq(connections.lockToken, token)));
    console.info("[apple-calendar] disconnected", { actorId });
  } finally { await release(token); }
}

function appointmentValues(value: CalendarEvent) {
  return { title: value.title, startsAt: value.startsAt, endsAt: value.endsAt, allDay: value.allDay,
    location: value.location || null, notes: value.notes || null, status: value.cancelled ? "cancelled" : "scheduled" };
}

export async function syncAppleCalendar() {
  if (process.env.CRM_EXTERNAL_EFFECTS === "disabled") throw new AppleCalendarError("disabled");
  const { row: connection, token } = await lease();
  const deadline = Date.now() + 110_000;
  const result = { imported: 0, exported: 0, issues: 0, remaining: false };
  try {
    if (!connection.enabled || !connection.encryptedPassword) return result;
    await assertOwner(connection.ownerId);
    const apple = await appleClient(connection.appleAccount, decryptPassword(connection.encryptedPassword, connection.appleAccount, secret()), deadline);
    const calendars = await apple.client.fetchCalendars();
    const calendar = calendars.find(c => c.url === connection.calendarUrl);
    // A missing collection is NOT proof that all its events were deleted.
    if (!calendar) throw new AppleCalendarError("calendar-missing");
    const remoteObjects = await apple.client.fetchCalendarObjects({ calendar });
    if (remoteObjects.length > 2000) throw new AppleCalendarError("too-large");
    const remoteByUrl = new Map<string, { data: string; etag: string; url: string }>();
    for (const object of remoteObjects) {
      const url = eventUrl(object.url, connection.calendarUrl);
      if (typeof object.data !== "string" || !object.etag) throw new AppleCalendarError("invalid-event");
      remoteByUrl.set(url, { url, data: object.data, etag: object.etag });
    }
    let links = await db.select().from(mappings).where(eq(mappings.connectionId, "team"));
    const linkedIds = links.flatMap(m => m.appointmentId ? [m.appointmentId] : []);
    const localRows = await db.select().from(appointments).where(or(
      gte(appointments.startsAt, new Date(Date.now() - 90 * 86400000)),
      linkedIds.length ? inArray(appointments.id, linkedIds) : undefined,
    )).limit(2001);
    if (localRows.length > 2000 || links.length > 2000) throw new AppleCalendarError("too-large");
    const linked = new Set(linkedIds);
    for (const local of localRows) {
      if (linked.has(local.id) || local.status === "cancelled" || local.completedAt) continue;
      const uid = `${local.id}@habitat-one-crm`, remoteUrl = eventUrl(`crm-${local.id}.ics`, calendar.url);
      await db.insert(mappings).values({ connectionId: "team", appointmentId: local.id, uid, remoteUrl,
        localHash: eventHash(fromAppointment(local)) }).onConflictDoNothing();
    }
    links = await db.select().from(mappings).where(eq(mappings.connectionId, "team")).orderBy(mappings.updatedAt);
    const knownUrls = new Set(links.map(m => m.remoteUrl)), knownUids = new Set(links.map(m => m.uid));
    const ambiguousUids = new Set<string>();
    // Import only this dedicated work calendar. No personal calendar data is read.
    for (const object of remoteByUrl.values()) {
      if (knownUrls.has(object.url)) continue;
      if (Date.now() > deadline - 10_000) { result.remaining = true; break; }
      let parsed;
      try { parsed = parseEvent(object.data); } catch { result.issues++; continue; }
      if (knownUids.has(parsed.uid)) { ambiguousUids.add(parsed.uid); result.issues++; continue; }
      const hash = eventHash(parsed.value);
      await db.transaction(async tx => {
        const [appointment] = await tx.insert(appointments).values({ ...appointmentValues(parsed.value),
          assigneeId: connection.ownerId, createdBy: connection.ownerId }).returning({ id: appointments.id });
        await tx.insert(mappings).values({ connectionId: "team", appointmentId: appointment.id, uid: parsed.uid,
          remoteUrl: object.url, localHash: hash, remoteHash: hash });
      });
      knownUids.add(parsed.uid);
      result.imported++;
    }
    for (const link of links) {
      if (Date.now() > deadline - 10_000) { result.remaining = true; break; }
      // A UID appearing at another URL may be a move or a duplicate, not a deletion.
      if (ambiguousUids.has(link.uid)) {
        await db.update(mappings).set({ issue: "unsupported" }).where(eq(mappings.id, link.id));
        continue;
      }
      const local = link.appointmentId ? await db.query.appointments.findFirst({ where: eq(appointments.id, link.appointmentId) }) : null;
      const localValue = local ? fromAppointment(local) : null;
      // Confirm each apparent deletion individually; incomplete REPORTs must never erase CRM data.
      const object = remoteByUrl.get(link.remoteUrl) ?? await apple.get(link.remoteUrl, calendar.url);
      let remote: ReturnType<typeof parseEvent> | null;
      try {
        remote = object ? parseEvent(object.data) : null;
        if (remote && remote.uid !== link.uid) throw new Error("uid-changed");
      } catch {
        await db.update(mappings).set({ issue: "unsupported" }).where(eq(mappings.id, link.id));
        result.issues++; continue;
      }
      const decision = syncDecision(localValue, remote?.value ?? null, link);
      const mark = async (values: Partial<typeof mappings.$inferInsert>) => {
        await db.update(mappings).set({ ...values, resolution: null, issue: null, updatedAt: new Date() }).where(eq(mappings.id, link.id));
      };
      try {
        if (decision === "conflict") {
          await db.update(mappings).set({ issue: "conflict" }).where(eq(mappings.id, link.id));
          result.issues++; continue;
        }
        if (decision === "push" && localValue) {
          await apple.put(link.remoteUrl, calendar.url, serializeEvent(link.uid, localValue, object?.data), object?.etag);
          // Both baselines reflect the exact snapshot sent. Concurrent CRM edits remain pending.
          await mark({ localHash: eventHash(localValue), remoteHash: eventHash(localValue), remoteDeleted: false });
          result.exported++;
        } else if (decision === "delete") {
          if (object) await apple.remove(link.remoteUrl, calendar.url, object.etag);
          await mark({ localHash: localValue ? eventHash(localValue) : null, remoteHash: null, remoteDeleted: true });
          result.exported++;
        } else if ((decision === "pull" || decision === "cancel") && local && localValue) {
          const value = decision === "cancel" ? { ...localValue, cancelled: true } : remote!.value;
          await db.transaction(async tx => {
            const [updated] = await tx.update(appointments).set({ ...appointmentValues(value),
              // Completion belongs to CRM workflow, not Apple's CONFIRMED status.
              status: value.cancelled ? "cancelled" : local.completedAt ? "completed" : "scheduled",
              updatedAt: new Date() }).where(and(eq(appointments.id, local.id), sql`date_trunc('milliseconds', ${appointments.updatedAt}) = ${local.updatedAt.toISOString()}::timestamptz`)).returning({ id: appointments.id });
            if (!updated) throw new AppleCalendarError("changed");
            await tx.update(mappings).set({ localHash: eventHash(value), remoteHash: remote ? eventHash(remote.value) : null,
              remoteDeleted: !remote, issue: null, resolution: null, updatedAt: new Date() }).where(eq(mappings.id, link.id));
          });
          result.imported++;
        } else if (decision === "restore" && remote) {
          await db.transaction(async tx => {
            const [restored] = await tx.insert(appointments).values({ ...appointmentValues(remote!.value), createdBy: connection.ownerId,
              assigneeId: connection.ownerId }).returning({ id: appointments.id });
            await tx.update(mappings).set({ appointmentId: restored.id, localHash: eventHash(remote!.value),
              remoteHash: eventHash(remote!.value), remoteDeleted: false, issue: null, resolution: null }).where(eq(mappings.id, link.id));
          });
          result.imported++;
        } else {
          await mark({ localHash: localValue ? eventHash(localValue) : null, remoteHash: remote ? eventHash(remote.value) : null, remoteDeleted: !remote });
        }
      } catch (error) {
        if (!(error instanceof AppleCalendarError) || error.message !== "changed") throw error;
        await db.update(mappings).set({ issue: "conflict", resolution: null }).where(eq(mappings.id, link.id));
        result.issues++;
      }
    }
    await db.update(connections).set({ lastSyncedAt: new Date(), lastError: result.remaining ? "remaining" : result.issues ? "issues" : null })
      .where(and(eq(connections.id, "team"), eq(connections.lockToken, token)));
    return result;
  } catch (error) {
    const code = error instanceof AppleCalendarError ? error.message : "unavailable";
    await db.update(connections).set({ lastError: code }).where(and(eq(connections.id, "team"), eq(connections.lockToken, token)));
    console.warn("[apple-calendar] sync failed", { code });
    throw new AppleCalendarError(code, { cause: error });
  } finally { await release(token); }
}
