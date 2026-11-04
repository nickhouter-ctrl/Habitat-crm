import { describe, expect, it, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { eventHash, fromAppointment, parseEvent, serializeEvent, syncDecision, type CalendarEvent } from "../apple-calendar/events";
import { decryptPassword, encryptPassword, appleUrl, eventUrl } from "../apple-calendar/security";
import { appleTransport } from "../apple-calendar/client";

const event: CalendarEvent = { title: "Showroom – Xàbia 🏡", startsAt: new Date("2026-11-04T10:00:00Z"),
  endsAt: new Date("2026-11-04T11:00:00Z"), allDay: false, location: "Calle, 1; Xàbia",
  notes: "Eerste regel\nTweede regel \\ test", cancelled: false };
const base = { localHash: eventHash(event), remoteHash: eventHash(event), remoteDeleted: false };
const changed = { ...event, title: "Verplaatst" };
const calendarUrl = "https://p01-caldav.icloud.com/123/calendars/work/";
const ics = (fields: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nSUMMARY:Test\r\n${fields}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

describe("Apple agenda ICS", () => {
  it("round-trips times, Unicode and escaped values", () => {
    const parsed = parseEvent(serializeEvent("stable-id", event));
    expect(parsed.uid).toBe("stable-id"); expect(parsed.value).toEqual(event);
  });
  it("preserves reminders and UID when editing an Apple event", () => {
    const source = serializeEvent("stable-id", event).replace("END:VEVENT", "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT");
    const output = serializeEvent("stable-id", changed, source);
    expect(output).toContain("BEGIN:VALARM"); expect(parseEvent(output).value.title).toBe("Verplaatst");
    expect(() => serializeEvent("different-id", event, source)).toThrow();
  });
  it("uses Madrid for floating dates and respects winter/summer offsets", () => {
    expect(parseEvent(ics("DTSTART:20261204T090000\r\nDTEND:20261204T100000")).value.startsAt.toISOString()).toBe("2026-12-04T08:00:00.000Z");
    expect(parseEvent(ics("DTSTART;TZID=Europe/Madrid:20260704T090000\r\nDTEND;TZID=Europe/Madrid:20260704T100000")).value.startsAt.toISOString()).toBe("2026-07-04T07:00:00.000Z");
  });
  it("round-trips whole-day events across the daylight-saving transition", () => {
    const parsed = parseEvent(ics("DTSTART;VALUE=DATE:20260329\r\nDTEND;VALUE=DATE:20260330"));
    expect(parsed.value.allDay).toBe(true);
    expect(+parsed.value.endsAt - +parsed.value.startsAt).toBe(23 * 3600000);
    expect(parseEvent(serializeEvent("test", parsed.value)).value).toEqual(parsed.value);
  });
  it("converts a timed event to a whole-day event without retaining TZID", () => {
    const source = ics("DTSTART;TZID=Europe/Madrid:20261104T110000\r\nDTEND;TZID=Europe/Madrid:20261104T120000");
    const day = parseEvent(ics("DTSTART;VALUE=DATE:20261104\r\nDTEND;VALUE=DATE:20261105")).value;
    const output = serializeEvent("test", day, source);
    expect(output).not.toContain("TZID="); expect(parseEvent(output).value).toEqual(day);
  });
  it.each(["RRULE:FREQ=DAILY", "RDATE:20261105T100000Z", "RECURRENCE-ID:20261104T100000Z", "ATTENDEE:mailto:test@example.com", "ORGANIZER:mailto:test@example.com"])("does not flatten or send invitations: %s", extra => {
    expect(() => parseEvent(ics(`DTSTART:20261104T100000Z\r\nDTEND:20261104T110000Z\r\n${extra}`))).toThrow();
  });
  it("rejects unsupported timezones, invalid intervals and oversized events", () => {
    expect(() => parseEvent(ics("DTSTART;TZID=Unknown/Zone:20261104T100000\r\nDTEND;TZID=Unknown/Zone:20261104T110000"))).toThrow();
    expect(() => parseEvent(ics("DTSTART:20261104T110000Z\r\nDTEND:20261104T100000Z"))).toThrow();
    expect(() => parseEvent("x".repeat(100001))).toThrow();
  });
  it("does not map CRM completion onto a cancellation", () => {
    expect(fromAppointment({ ...event, status: "completed" }).cancelled).toBe(false);
  });
});

describe("bidirectional sync decisions", () => {
  it("exports new events and retries without duplicates after a successful PUT", () => {
    expect(syncDecision(event, null, { ...base, remoteHash: null })).toBe("push");
    expect(syncDecision(event, event, { ...base, remoteHash: null })).toBe("checkpoint");
  });
  it("ignores subsecond precision that iCalendar cannot represent", () => {
    const precise = { ...event, startsAt: new Date(+event.startsAt + 123) };
    expect(eventHash(precise)).toBe(eventHash(event));
    expect(syncDecision(precise, parseEvent(serializeEvent("id", precise)).value, base)).toBe("checkpoint");
  });
  it("propagates changes in either direction", () => {
    expect(syncDecision(changed, event, base)).toBe("push");
    expect(syncDecision(event, changed, base)).toBe("pull");
  });
  it("does not overwrite independent concurrent changes", () => {
    expect(syncDecision(changed, { ...event, notes: "Apple edit" }, base)).toBe("conflict");
    expect(syncDecision(changed, changed, base)).toBe("checkpoint");
  });
  it("propagates confirmed deletions while preserving tombstones", () => {
    expect(syncDecision(null, event, base)).toBe("delete");
    expect(syncDecision(event, null, base)).toBe("cancel");
    expect(syncDecision(null, null, { ...base, remoteDeleted: true })).toBe("checkpoint");
    const cancelled = { ...event, cancelled: true };
    expect(syncDecision(cancelled, null, { localHash: eventHash(cancelled), remoteHash: null, remoteDeleted: true })).toBe("checkpoint");
    expect(syncDecision(event, null, { localHash: eventHash(cancelled), remoteHash: null, remoteDeleted: true })).toBe("push");
  });
  it("treats deletion versus editing as a conflict", () => {
    expect(syncDecision(null, changed, base)).toBe("conflict");
    expect(syncDecision(changed, null, base)).toBe("conflict");
  });
  it("applies explicit conflict choices, including restore and deletion", () => {
    expect(syncDecision(changed, event, { ...base, resolution: "apple" })).toBe("pull");
    expect(syncDecision(null, changed, { ...base, resolution: "apple" })).toBe("restore");
    expect(syncDecision(changed, null, { ...base, resolution: "apple" })).toBe("cancel");
    expect(syncDecision(changed, null, { ...base, resolution: "crm" })).toBe("push");
    expect(syncDecision(null, changed, { ...base, resolution: "crm" })).toBe("delete");
  });
});

describe("calendar credentials and URL boundaries", () => {
  const secret = "a".repeat(48);
  it("encrypts with a fresh nonce and binds ciphertext to the Apple account", () => {
    const value = encryptPassword("test-password", "a@example.com", secret);
    expect(value).not.toContain("test-password");
    expect(decryptPassword(value, "a@example.com", secret)).toBe("test-password");
    expect(encryptPassword("test-password", "a@example.com", secret)).not.toBe(value);
    expect(() => decryptPassword(value, "b@example.com", secret)).toThrow();
    expect(() => decryptPassword(value, "a@example.com", "b".repeat(48))).toThrow();
    expect(() => encryptPassword("password", "a", "short")).toThrow();
  });
  it.each(["http://caldav.icloud.com/", "https://caldav.icloud.com.evil.test/", "https://127.0.0.1/", "https://169.254.169.254/", "https://icloud.com/", "https://user:pass@caldav.icloud.com/", "https://caldav.icloud.com:8443/", "https://caldav.icloud.com/?secret=x"])("rejects non-calendar destinations: %s", value => expect(() => appleUrl(value)).toThrow());
  it("rejects calendar traversal and cross-account event URLs", () => {
    expect(eventUrl("one.ics", calendarUrl)).toBe(calendarUrl + "one.ics");
    for (const value of ["../private.ics", "%2e%2e/private.ics", "a%2fb.ics", "https://p02-caldav.icloud.com/123/calendars/work/one.ics"]) expect(() => eventUrl(value, calendarUrl)).toThrow();
  });
  it("canonicalizes iCloud's central-host event aliases only inside the work collection", () => {
    expect(eventUrl("https://caldav.icloud.com/123/calendars/work/one.ics", calendarUrl)).toBe(calendarUrl + "one.ics");
    expect(() => eventUrl("https://caldav.icloud.com/999/calendars/work/one.ics", calendarUrl)).toThrow();
    expect(() => eventUrl("https://caldav.icloud.com/123/calendars/private/one.ics", calendarUrl)).toThrow();
  });
});

describe("Apple transport", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("preserves validated manual discovery redirects for tsdav", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 301, headers: { location: calendarUrl } }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await appleTransport(Date.now() + 10000)("https://caldav.icloud.com/.well-known/caldav", { redirect: "manual" });
    expect(response.status).toBe(301); expect(response.headers.get("location")).toBe(calendarUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("blocks credential-bearing redirects outside the Apple allowlist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.test/steal" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(appleTransport(Date.now() + 10000)("https://caldav.icloud.com", { headers: { authorization: "test" } })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses manual redirects and timeouts, reports auth failures without response data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("private-account-details", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(appleTransport(Date.now() + 10000)(calendarUrl)).rejects.toThrow("credentials");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("bounds response sizes before XML parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(8_000_001))));
    await expect(appleTransport(Date.now() + 10000)(calendarUrl)).rejects.toThrow("too-large");
  });
});
