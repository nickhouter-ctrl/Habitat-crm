import "server-only";
import type { DAVClient, DAVCalendar } from "tsdav";
import { AppleCalendarError } from "./client";
import { appleUrl } from "./security";

/** Probe only our reserved collection, without querying private/shared calendars. */
export async function findWorkCalendar(client: Pick<DAVClient, "propfind">, calendarUrl: string): Promise<DAVCalendar | null> {
  const target = appleUrl(calendarUrl);
  const responses = await client.propfind({ url: target.href, depth: "0", props: { "d:resourcetype": {} } });
  if (responses.length !== 1) throw new AppleCalendarError("unavailable");
  const response = responses[0];
  if (response.status === 404) return null;
  if (!response.ok || !response.href) throw new AppleCalendarError("unavailable");
  const actual = appleUrl(new URL(response.href, target).href);
  // iCloud can return the central hostname for a request to its partition host.
  // Identity still requires the exact account and collection path.
  const sameHost = actual.hostname === target.hostname
    || actual.hostname === "caldav.icloud.com" || target.hostname === "caldav.icloud.com";
  if (!sameHost || actual.pathname.replace(/\/$/, "") !== target.pathname.replace(/\/$/, "")
    || !Object.hasOwn(response.props?.resourcetype ?? {}, "calendar")) throw new AppleCalendarError("calendar-missing");
  return { url: target.href };
}

/** Recheck the same URL after a refused create: iCloud may already have created it. */
export async function ensureWorkCalendar(client: Pick<DAVClient, "propfind" | "makeCalendar">, calendarUrl: string, name: string, previouslySynced: boolean) {
  const existing = await findWorkCalendar(client, calendarUrl);
  if (existing) return existing;
  if (previouslySynced) throw new AppleCalendarError("calendar-missing");
  try {
    const result = await client.makeCalendar({ url: calendarUrl, props: {
      "d:displayname": name,
      "c:supported-calendar-component-set": { "c:comp": { _attributes: { name: "VEVENT" } } },
    } });
    if (!result.length || result.some(r => !r.ok)) throw new AppleCalendarError("unavailable");
  } catch (error) {
    // Never treat authentication failures, timeouts or arbitrary provider errors
    // as success. A 403 is recoverable only if the exact work calendar now exists.
    if (!(error instanceof AppleCalendarError) || error.message !== "forbidden") throw error;
    const created = await findWorkCalendar(client, calendarUrl);
    if (created) return created;
    throw error;
  }
  const created = await findWorkCalendar(client, calendarUrl);
  if (!created) throw new AppleCalendarError("calendar-missing");
  return created;
}
