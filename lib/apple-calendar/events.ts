import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { z } from "zod";
import { agendaDateTime, agendaDay, shiftDay } from "@/lib/agenda-dates";
import { plainEventText, presentationMatches, writePresentation, type EventPresentation } from "./presentation";

export const eventSchema = z.object({
  title: z.string().trim().min(1).max(250).regex(/^[^\r\n\0]+$/),
  startsAt: z.date().min(new Date("2000-01-01")).max(new Date("2101-01-01")),
  endsAt: z.date(),
  allDay: z.boolean(),
  location: z.string().max(500),
  notes: z.string().max(5000),
  cancelled: z.boolean(),
}).refine(v => v.endsAt > v.startsAt && v.endsAt < new Date("2101-01-01"));
export type CalendarEvent = z.infer<typeof eventSchema>;

export function fromAppointment(a: {
  title: string; startsAt: Date; endsAt: Date | null; allDay: boolean;
  location: string | null; notes: string | null; status: string;
}): CalendarEvent {
  return eventSchema.parse({ ...a, endsAt: a.endsAt ?? new Date(+a.startsAt + 3600000),
    location: a.location ?? "", notes: a.notes ?? "", cancelled: a.status === "cancelled" });
}

export function eventHash(event: CalendarEvent): string {
  return createHash("sha256").update(JSON.stringify([
    // iCalendar timestamps have second precision; Postgres can have microseconds.
    event.title, Math.floor(+event.startsAt / 1000), Math.floor(+event.endsAt / 1000),
    event.allDay, event.location, event.notes, event.cancelled,
  ])).digest("hex");
}

export class UnsupportedCalendarEvent extends Error {}

function readCalendar(data: string) {
  if (Buffer.byteLength(data) > 100_000) throw new UnsupportedCalendarEvent("too-large");
  const calendar = new ICAL.Component(ICAL.parse(data));
  const events = calendar.getAllSubcomponents("vevent");
  if (calendar.name !== "vcalendar" || events.length !== 1) throw new UnsupportedCalendarEvent("series");
  const component = events[0];
  const event = new ICAL.Event(component);
  // The CRM has no series or invitation model. Never silently flatten either.
  if (event.isRecurring() || event.isRecurrenceException() || component.hasProperty("attendee") || component.hasProperty("organizer")) {
    throw new UnsupportedCalendarEvent("series-or-invitation");
  }
  return { calendar, component, event };
}

function date(time: ICAL.Time, calendar: ICAL.Component, component: ICAL.Component, property: string): Date {
  if (time.isDate) {
    const at = agendaDateTime(time.toString());
    if (!at) throw new UnsupportedCalendarEvent("date");
    return at;
  }
  const tzid = component.getFirstProperty(property)?.getParameter("tzid");
  if (tzid && time.zone.tzid === "floating") {
    const zone = calendar.getAllSubcomponents("vtimezone").find(z => z.getFirstPropertyValue("tzid") === tzid);
    if (zone) time.zone = new ICAL.Timezone({ component: zone });
    else if (tzid === "Europe/Madrid") {
      const at = agendaDateTime(time.toString().slice(0, 10), time.toString().slice(11, 16));
      if (!at) throw new UnsupportedCalendarEvent("timezone");
      at.setUTCSeconds(time.second);
      return at;
    } else throw new UnsupportedCalendarEvent("timezone");
  }
  if (time.zone.tzid === "floating") {
    const at = agendaDateTime(time.toString().slice(0, 10), time.toString().slice(11, 16));
    if (!at) throw new UnsupportedCalendarEvent("floating-date");
    at.setUTCSeconds(time.second);
    return at;
  }
  return time.toJSDate();
}

export function parseEvent(data: string, contextKey?: string): { uid: string; value: CalendarEvent } {
  const { calendar, component, event } = readCalendar(data);
  const uid = z.string().min(1).max(500).regex(/^[^\r\n\0]+$/).parse(event.uid);
  const start = event.startDate;
  if (!start) throw new UnsupportedCalendarEvent("missing-start");
  const startsAt = date(start, calendar, component, "dtstart");
  let endsAt = date(event.endDate, calendar, component, "dtend");
  if (+endsAt === +startsAt) endsAt = start.isDate
    ? agendaDateTime(shiftDay(agendaDay(startsAt), 1))! : new Date(+startsAt + 3600000);
  return { uid, value: eventSchema.parse({ ...plainEventText(component, uid, contextKey), startsAt, endsAt,
    allDay: start.isDate, location: event.location || "",
    cancelled: component.getFirstPropertyValue("status") === "CANCELLED" }) };
}

export function serializeEvent(uid: string, value: CalendarEvent, existing?: string, display?: { context: EventPresentation; key: string }): string {
  const v = eventSchema.parse(value);
  const { calendar, component } = existing ? readCalendar(existing) : {
    calendar: new ICAL.Component("vcalendar"), component: new ICAL.Component("vevent"),
  };
  if (!existing) {
    calendar.updatePropertyWithValue("version", "2.0");
    calendar.updatePropertyWithValue("prodid", "-//Habitat One//CRM//NL");
    calendar.addSubcomponent(component);
    component.updatePropertyWithValue("uid", uid);
  }
  if (existing && component.getFirstPropertyValue("uid") !== uid) throw new Error("UID mismatch");
  component.updatePropertyWithValue("summary", v.title);
  component.updatePropertyWithValue("location", v.location);
  component.updatePropertyWithValue("description", v.notes);
  if (display) writePresentation(component, uid, v.title, v.notes, display.context, display.key);
  // Recreate these properties to remove old TZID/VALUE parameters.
  for (const name of ["dtstart", "dtend", "duration"]) component.removeAllProperties(name);
  component.updatePropertyWithValue("dtstart", v.allDay ? ICAL.Time.fromDateString(agendaDay(v.startsAt)) : ICAL.Time.fromJSDate(v.startsAt, true));
  component.updatePropertyWithValue("dtend", v.allDay ? ICAL.Time.fromDateString(agendaDay(v.endsAt)) : ICAL.Time.fromJSDate(v.endsAt, true));
  component.updatePropertyWithValue("status", v.cancelled ? "CANCELLED" : "CONFIRMED");
  component.updatePropertyWithValue("dtstamp", ICAL.Time.fromJSDate(new Date(), true));
  component.updatePropertyWithValue("last-modified", ICAL.Time.fromJSDate(new Date(), true));
  component.updatePropertyWithValue("sequence", Number(component.getFirstPropertyValue("sequence") || 0) + 1);
  return calendar.toString() + "\r\n";
}

export function hasEventPresentation(data: string, expected: EventPresentation, key: string): boolean {
  const { component, event } = readCalendar(data);
  return presentationMatches(component, event.uid, expected, key);
}

export type Baseline = { localHash: string | null; remoteHash: string | null; remoteDeleted: boolean; resolution?: string | null };
export function syncDecision(local: CalendarEvent | null, remote: CalendarEvent | null, base: Baseline) {
  const lh = local ? eventHash(local) : null, rh = remote ? eventHash(remote) : null;
  if (base.resolution === "crm") return local && !local.cancelled ? "push" : "delete";
  if (base.resolution === "apple") return remote ? (local ? "pull" : "restore") : "cancel";
  if (!local && !remote) return "checkpoint";
  if (!local) return rh === base.remoteHash ? "delete" : "conflict";
  if (!remote) {
    if (local.cancelled) return "checkpoint";
    if (base.remoteDeleted) return lh === base.localHash ? "checkpoint" : "push";
    if (!base.remoteHash) return "push";
    return lh === base.localHash ? "cancel" : "conflict";
  }
  if (lh === rh) return "checkpoint";
  const localChanged = lh !== base.localHash, remoteChanged = rh !== base.remoteHash;
  if (localChanged && remoteChanged) return "conflict";
  if (remoteChanged) return "pull";
  if (localChanged) return local.cancelled ? "delete" : "push";
  return "checkpoint";
}
