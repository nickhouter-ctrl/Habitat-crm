import { createHmac, timingSafeEqual } from "node:crypto";
import type ICAL from "ical.js";
import { z } from "zod";

const property = "x-habitat-crm-context";
const begin = "[Habitat One CRM]", end = "[/Habitat One CRM]";
const schema = z.object({ version: z.literal(1), prefix: z.string().max(20), suffix: z.string().max(400), block: z.string().max(2500), url: z.string().max(500) }).strict();
export type EventPresentation = z.infer<typeof schema>;
const line = (value: string | null | undefined, fallback: string) => (value?.replace(/[\r\n\0]/g, " ").trim() || fallback).slice(0, 160);

export function eventPresentation(input: {
  id: string; day: string; kind: "appointment" | "task";
  contactId: string | null; contactName: string | null;
  assigneeName: string | null; creatorName: string | null;
}): EventPresentation {
  z.string().uuid().parse(input.id);
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(input.day);
  const customer = line(input.contactName, "Geen klant gekoppeld");
  const owner = line(input.assigneeName ?? input.creatorName, "Niet toegewezen");
  const url = input.kind === "task" ? `https://crm.habitat-one.com/agenda/afvinken/${input.id}`
    : `https://crm.habitat-one.com/agenda?date=${input.day}&owner=all&kind=appt`;
  const details = [begin, `Type: ${input.kind === "task" ? "Taak / deadline" : "Afspraak"}`,
    `Klant: ${customer}`, `Verantwoordelijke: ${owner}`,
    `Aangemaakt door: ${line(input.creatorName, "Onbekend")}`,
    `${input.kind === "task" ? "Taak bekijken en afvinken" : "Bekijk afspraak in CRM"}: ${url}`];
  if (input.contactId) details.push(`Klantdossier: https://crm.habitat-one.com/contacts/${z.string().uuid().parse(input.contactId)}`);
  if (input.kind === "task") details.push("De begintijd is de deadline. Taken wijzig en vink je af via de CRM-link. Wijzigingen in Apple worden bij de volgende synchronisatie vervangen door de CRM-taak.");
  details.push("Klant en verantwoordelijke wijzig je in het CRM.", end);
  return schema.parse({ version: 1, prefix: input.kind === "task" ? "Taak: " : "",
    suffix: ` — ${customer} — ${owner}`, block: details.join("\n"), url });
}

function signature(uid: string, payload: string, key: string) {
  if (key.length < 32) throw new Error("Calendar signing unavailable");
  return createHmac("sha256", key).update(`apple-calendar-context-v1\0${uid}\0${payload}`).digest("hex");
}
function read(component: ICAL.Component, uid: string, key?: string): EventPresentation | null {
  const encoded = component.getFirstPropertyValue(property);
  if (encoded == null) return null;
  if (typeof encoded !== "string" || encoded.length > 16000 || !key) throw new Error("Invalid calendar context");
  const [payload, mac, extra] = encoded.split(".");
  if (!payload || !mac || extra || !/^[a-f0-9]{64}$/.test(mac)
    || !timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(signature(uid, payload, key), "hex"))) throw new Error("Invalid calendar context");
  return schema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
}

/** Signed formatting never becomes user-editable CRM title/body or a relation ID. */
export function plainEventText(component: ICAL.Component, uid: string, key?: string) {
  let title = String(component.getFirstPropertyValue("summary") || "Afspraak");
  let notes = String(component.getFirstPropertyValue("description") || "");
  const context = read(component, uid, key);
  if (!context) {
    if (notes.includes(begin) || notes.includes(end)) throw new Error("Calendar context missing");
    return { title, notes };
  }
  if (context.prefix && title.startsWith(context.prefix)) title = title.slice(context.prefix.length);
  if (context.suffix) title = title.replace(context.suffix, "");
  const at = notes.indexOf(context.block);
  if (at >= 0) {
    const before = notes.slice(0, at).replace(/\n\n$/, "");
    const after = notes.slice(at + context.block.length).replace(/^\n\n/, "");
    notes = [before, after].filter(Boolean).join("\n\n");
  } else if (notes.includes(begin) || notes.includes(end)) throw new Error("Calendar context edited");
  return { title, notes };
}

export function writePresentation(component: ICAL.Component, uid: string, title: string, notes: string, context: EventPresentation, key: string) {
  const value = schema.parse(context), payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  component.updatePropertyWithValue("summary", `${value.prefix}${title}${value.suffix}`);
  component.updatePropertyWithValue("description", notes ? `${notes}\n\n${value.block}` : value.block);
  component.updatePropertyWithValue("url", value.url);
  if (value.prefix === "Taak: ") component.updatePropertyWithValue("transp", "TRANSPARENT");
  component.updatePropertyWithValue(property, `${payload}.${signature(uid, payload, key)}`);
}

export function presentationMatches(component: ICAL.Component, uid: string, expected: EventPresentation, key: string) {
  const actual = read(component, uid, key);
  return JSON.stringify(actual) === JSON.stringify(expected)
    && String(component.getFirstPropertyValue("description") || "").includes(expected.block)
    && String(component.getFirstPropertyValue("summary") || "").includes(expected.suffix)
    && String(component.getFirstPropertyValue("summary") || "").startsWith(expected.prefix)
    && component.getFirstPropertyValue("url") === expected.url;
}
