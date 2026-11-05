import { describe, expect, it } from "vitest";
import ICAL from "ical.js";
import { eventPresentation } from "../apple-calendar/presentation";
import { eventHash, hasEventPresentation, parseEvent, serializeEvent, syncDecision, type CalendarEvent } from "../apple-calendar/events";
import { fromTask } from "../apple-calendar/tasks";

const key = "presentation-test-secret-".repeat(3), uid = "fixture@habitat-one-crm";
const value: CalendarEvent = { title: "Showroombezoek", notes: "Bespreek de nieuwe keuken.", location: "Jávea",
  startsAt: new Date("2026-11-04T11:30:00Z"), endsAt: new Date("2026-11-04T12:30:00Z"), allDay: false, cancelled: false };
const input = { id: "11111111-1111-4111-8111-111111111111", day: "2026-11-04", kind: "appointment" as const,
  contactId: "22222222-2222-4222-8222-222222222222", contactName: "Salvadores Moles", assigneeName: "Teresa", creatorName: "Nick" };
const context = eventPresentation(input);
const rendered = () => serializeEvent(uid, value, undefined, { context, key });
function edit(data: string, operation: (event: ICAL.Component) => void) {
  const calendar = new ICAL.Component(ICAL.parse(data)); operation(calendar.getFirstSubcomponent("vevent")!); return calendar.toString();
}
describe("calendar details without round-trip pollution", () => {
  it("shows the customer, owner and CRM links but keeps the core hash unchanged", () => {
    const data = rendered(), event = new ICAL.Component(ICAL.parse(data)).getFirstSubcomponent("vevent")!;
    expect(event.getFirstPropertyValue("summary")).toBe("Showroombezoek — Salvadores Moles — Teresa");
    expect(String(event.getFirstPropertyValue("description"))).toContain("Aangemaakt door: Nick");
    expect(event.getFirstPropertyValue("url")).toContain("https://crm.habitat-one.com/agenda?");
    expect(parseEvent(data, key).value).toEqual(value);
    expect(eventHash(parseEvent(data, key).value)).toBe(eventHash(value));
    expect(hasEventPresentation(data, context, key)).toBe(true);
  });
  it("imports Apple title, note and time edits without the generated details", () => {
    const data = edit(rendered(), event => {
      event.updatePropertyWithValue("summary", "Nieuwe afspraak" + context.suffix);
      event.updatePropertyWithValue("description", "Gewijzigde notitie\n\n" + context.block);
      event.updatePropertyWithValue("dtstart", ICAL.Time.fromJSDate(new Date("2026-11-04T12:00:00Z"), true));
    });
    const parsed = parseEvent(data, key).value;
    expect(parsed.title).toBe("Nieuwe afspraak"); expect(parsed.notes).toBe("Gewijzigde notitie");
    expect(parsed.startsAt.toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(syncDecision(value, parsed, { localHash: eventHash(value), remoteHash: eventHash(value), remoteDeleted: false })).toBe("pull");
  });
  it("refreshes assignment separately from conflicts and preserves reminders", () => {
    const next = eventPresentation({ ...input, assigneeName: "Carmen" });
    const source = edit(rendered(), e => { const alarm = new ICAL.Component("valarm"); alarm.updatePropertyWithValue("action", "DISPLAY"); e.addSubcomponent(alarm); });
    expect(hasEventPresentation(source, next, key)).toBe(false);
    const updated = serializeEvent(uid, value, source, { context: next, key });
    expect(updated).toContain("BEGIN:VALARM");
    expect(parseEvent(updated, key).value).toEqual(value);
    expect(hasEventPresentation(updated, next, key)).toBe(true);
  });
  it("supports empty notes, notes after the details, and full-length CRM notes", () => {
    expect(parseEvent(serializeEvent(uid, { ...value, notes: "" }, undefined, { context, key }), key).value.notes).toBe("");
    const after = edit(rendered(), e => e.updatePropertyWithValue("description", value.notes + "\n\n" + context.block + "\n\nExtra notitie"));
    expect(parseEvent(after, key).value.notes).toBe(value.notes + "\n\nExtra notitie");
    const long = { ...value, title: "T".repeat(250), notes: "N".repeat(5000) };
    expect(parseEvent(serializeEvent(uid, long, undefined, { context, key }), key).value).toEqual(long);
  });
  it("rejects tampered or missing context metadata instead of importing generated data", () => {
    expect(() => parseEvent(rendered(), "wrong-key-".repeat(5))).toThrow();
    expect(() => parseEvent(edit(rendered(), e => e.removeAllProperties("x-habitat-crm-context")), key)).toThrow();
    expect(() => parseEvent(edit(rendered(), e => e.updatePropertyWithValue("uid", "another-event")), key)).toThrow();
    expect(() => parseEvent(edit(rendered(), e => e.updatePropertyWithValue("description", context.block.replace("Teresa", "Someone else"))), key)).toThrow();
  });
  it("labels dated tasks and links to the protected CRM completion page", () => {
    const task = fromTask({ subject: "Bel de klant", body: "Vraag naar de offerte", dueAt: value.startsAt })!;
    const taskContext = eventPresentation({ ...input, kind: "task" });
    const data = serializeEvent(uid, task, undefined, { context: taskContext, key });
    const component = new ICAL.Component(ICAL.parse(data)).getFirstSubcomponent("vevent")!;
    expect(String(component.getFirstPropertyValue("summary"))).toBe("Taak: Bel de klant — Salvadores Moles — Teresa");
    expect(component.getFirstPropertyValue("url")).toBe(`https://crm.habitat-one.com/agenda/afvinken/${input.id}`);
    expect(component.getFirstPropertyValue("transp")).toBe("TRANSPARENT");
    expect(+task.endsAt - +task.startsAt).toBe(15 * 60000);
    expect(parseEvent(data, key).value).toEqual(task);
    expect(fromTask({ subject: "Ongedateerd", body: null, dueAt: null })).toBeNull();
  });
});
