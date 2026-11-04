import { afterEach, describe, expect, it, vi } from "vitest";
import { DAVClient } from "tsdav";
vi.mock("server-only", () => ({}));
import { appleTransport } from "../apple-calendar/client";
import { ensureWorkCalendar, findWorkCalendar } from "../apple-calendar/collection";

const url = "https://p01-caldav.icloud.com/123/calendars/work/";
function collection(href = url, type = "calendar") {
  return new Response(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/><c:${type}/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
    { status: 207, headers: { "content-type": "application/xml" } });
}
async function client() {
  const value = new DAVClient({ serverUrl: "https://caldav.icloud.com", authMethod: "Basic",
    credentials: { username: "fixture@example.invalid", password: "fixture" }, fetch: appleTransport(Date.now() + 15000) });
  await value.authenticate(true);
  return value;
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("dedicated iCloud collection discovery", () => {
  it("uses the real DAV parser and checks only the work calendar, including central-host aliases", async () => {
    const fetchMock = vi.fn().mockResolvedValue(collection("https://caldav.icloud.com:443/123/calendars/work"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await ensureWorkCalendar(await client(), url, "Habitat One CRM", false)).toEqual({ url });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe(url); expect(init.method).toBe("PROPFIND");
    expect(new Headers(init.headers).get("depth")).toBe("0");
    expect(init.body).not.toContain("supported-report-set");
  });
  it("creates once and verifies the exact collection before connecting", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(collection());
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await ensureWorkCalendar(await client(), url, "Habitat One CRM", false)).toEqual({ url });
    expect(fetchMock.mock.calls.map(c => c[1].method)).toEqual(["PROPFIND", "MKCALENDAR", "PROPFIND"]);
    expect(fetchMock.mock.calls[1][1].body).toContain("<d:displayname>Habitat One CRM</d:displayname>");
  });
  it("recovers a partial creation only after confirming the same collection exists", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("private error", { status: 403 })).mockResolvedValueOnce(collection());
    vi.stubGlobal("fetch", fetchMock);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await ensureWorkCalendar(await client(), url, "Habitat One CRM", false)).toEqual({ url });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(warning.mock.calls)).not.toMatch(/private error|fixture|icloud|123/);
  });
  it("does not claim success or blame the password when a forbidden creation made no calendar", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ensureWorkCalendar(await client(), url, "Habitat One CRM", false)).rejects.toThrow("forbidden");
  });
  it("never recreates a previously synced calendar that disappeared", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ensureWorkCalendar(await client(), url, "Habitat One CRM", true)).rejects.toThrow("calendar-missing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([
    "https://caldav.icloud.com/999/calendars/work/",
    "https://caldav.icloud.com/123/calendars/private/",
    "https://p02-caldav.icloud.com/123/calendars/work/",
    "https://evil.example/123/calendars/work/",
  ])("rejects a different resource even when its type is calendar: %s", async href => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(collection(href)));
    await expect(findWorkCalendar(await client(), url)).rejects.toThrow();
  });
  it("does not recover an authentication failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ensureWorkCalendar(await client(), url, "Habitat One CRM", false)).rejects.toThrow("credentials");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects a successful response without a calendar resource type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(collection(url, "addressbook")));
    await expect(findWorkCalendar(await client(), url)).rejects.toThrow("calendar-missing");
  });
});
