import "server-only";
import { DAVClient } from "tsdav";
import { appleUrl, eventUrl } from "./security";

export class AppleCalendarError extends Error {}

/** Validate every discovery response and redirect before forwarding credentials. */
export function appleTransport(deadline: number): typeof fetch {
  return async (input, init) => {
    if (input instanceof Request) throw new AppleCalendarError("request");
    let url = appleUrl(String(input));
    for (let redirects = 0; redirects < 4; redirects++) {
      const remaining = deadline - Date.now();
      if (remaining < 1000) throw new AppleCalendarError("timeout");
      const response = await fetch(url, { ...init, redirect: "manual", cache: "no-store",
        signal: AbortSignal.timeout(Math.min(remaining, 15000)) });
      if ([301, 302, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new AppleCalendarError("redirect");
        url = appleUrl(new URL(location, url).href);
        // tsdav's discovery deliberately requests manual redirects so it can
        // retain the discovered root URL. Validate it before returning it.
        if (init?.redirect === "manual") return new Response(null, {
          status: response.status, headers: { location: url.href },
        });
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel();
        throw new AppleCalendarError("credentials");
      }
      // DAV XML and ICS are untrusted, including lengths and URLs supplied by Apple.
      const reader = response.body?.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8_000_000) { await reader.cancel(); throw new AppleCalendarError("too-large"); }
        chunks.push(value);
      }
      return new Response([204, 205, 304].includes(response.status) ? null : Buffer.concat(chunks), {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    }
    throw new AppleCalendarError("redirect");
  };
}

export async function appleClient(username: string, password: string, deadline: number) {
  if (process.env.CRM_EXTERNAL_EFFECTS === "disabled") throw new AppleCalendarError("disabled");
  const transport = appleTransport(deadline);
  const client = new DAVClient({ serverUrl: "https://caldav.icloud.com", credentials: { username, password },
    authMethod: "Basic", defaultAccountType: "caldav", fetch: transport });
  await client.login({ loadCollections: false, loadObjects: false });
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return {
    client,
    async get(url: string, calendarUrl: string) {
      const response = await transport(eventUrl(url, calendarUrl), { headers: { authorization } });
      if (response.status === 404 || response.status === 410) return null;
      if (!response.ok) throw new AppleCalendarError("unavailable");
      const data = await response.text(), etag = response.headers.get("etag");
      if (!etag || Buffer.byteLength(data) > 100_000) throw new AppleCalendarError("invalid-event");
      return { data, etag, url: eventUrl(url, calendarUrl) };
    },
    async put(url: string, calendarUrl: string, data: string, etag?: string) {
      const response = await transport(eventUrl(url, calendarUrl), { method: "PUT", body: data,
        headers: { authorization, "content-type": "text/calendar; charset=utf-8", ...(etag ? { "if-match": etag } : { "if-none-match": "*" }) } });
      if (response.status === 412) throw new AppleCalendarError("changed");
      if (!response.ok) throw new AppleCalendarError("unavailable");
    },
    async remove(url: string, calendarUrl: string, etag: string) {
      const response = await transport(eventUrl(url, calendarUrl), { method: "DELETE", headers: { authorization, "if-match": etag } });
      if (response.status === 412) throw new AppleCalendarError("changed");
      if (!response.ok && response.status !== 404 && response.status !== 410) throw new AppleCalendarError("unavailable");
    },
  };
}
