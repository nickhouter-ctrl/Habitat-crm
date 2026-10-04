import { madridUtcOffsetMinutes } from "@/lib/tz-madrid";

export const AGENDA_TIME_ZONE = "Europe/Madrid";
export const agendaDay = (at: Date) => at.toLocaleDateString("sv-SE", { timeZone: AGENDA_TIME_ZONE });

export function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const at = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}
export function shiftDay(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
/** Invoer is de klok in Madrid, onafhankelijk van browser/server en zomertijd. */
export function agendaDateTime(day: string, time = "00:00"): Date | null {
  if (!validDay(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const wall = new Date(`${day}T${time}:00Z`);
  let at = new Date(wall.getTime() - madridUtcOffsetMinutes(wall) * 60_000);
  at = new Date(wall.getTime() - madridUtcOffsetMinutes(at) * 60_000);
  const actualTime = at.toLocaleTimeString("en-GB", { timeZone: AGENDA_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  return agendaDay(at) === day && actualTime === time ? at : null;
}
export type AgendaView = "week" | "month";
export function agendaRange(day: string, view: AgendaView) {
  const first = view === "month" ? `${day.slice(0, 7)}-01` : day;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = shiftDay(first, -((weekday + 6) % 7));
  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => shiftDay(start, i));
  return { days, start: agendaDateTime(start)!, end: agendaDateTime(shiftDay(days.at(-1)!, 1))! };
}
export function adjacentPeriod(day: string, view: AgendaView, direction: number) {
  if (view === "week") return shiftDay(day, direction * 7);
  const at = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  at.setUTCMonth(at.getUTCMonth() + direction);
  return at.toISOString().slice(0, 10);
}
