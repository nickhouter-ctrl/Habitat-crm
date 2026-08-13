/**
 * Planningshelpers voor de campagne-UI (brief §7 + §9).
 *
 * Het team plant in Europe/Madrid; JavaScript-Dates zijn UTC. Deze module
 * vertaalt tussen die twee (inclusief zomer-/wintertijd) en bouwt Meta's
 * `adset_schedule`-blokken voor dagdelen. Let op: Meta rekent zelf in de
 * tijdzone van het advertentie-account — de UI toont die waarschuwing erbij.
 *
 * Puur en isomorf: geen Node-API's, bruikbaar in client én server.
 */

/** Minuten die Europe/Madrid op dat moment vóórloopt op UTC (60 of 120). */
function madridUtcOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(at).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * Parse een `datetime-local`-waarde ("2026-08-13T14:30") als Madrid-tijd naar
 * een UTC-Date. Twee correctiepassen vangen de DST-overgang af.
 */
export function parseMadridLocal(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(input);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const wallClockUtc = Date.UTC(y, mo - 1, d, h, mi);
  let guess = new Date(wallClockUtc);
  for (let i = 0; i < 2; i++) {
    guess = new Date(wallClockUtc - madridUtcOffsetMinutes(guess) * 60_000);
  }
  return guess;
}

/** Toon een UTC-Date als Madrid-tijd, bv. "13 aug 2026, 14:30". */
export function formatMadrid(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Madrid",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** UTC-Date → waarde voor een `datetime-local`-input, in Madrid-tijd. */
export function toMadridInputValue(date: Date | null | undefined): string {
  if (!date) return "";
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

/** Eén Meta `adset_schedule`-blok: dagen (0 = zondag) + minuten van de dag. */
export interface DaypartBlock {
  days: number[];
  start_minute: number;
  end_minute: number;
}

/** Bouw dagdeel-blokken uit de formulierkeuzes; null = geen dagdelen. */
export function buildDayparting(
  days: number[],
  startHour: number,
  endHour: number,
): DaypartBlock[] | null {
  if (days.length === 0 || endHour <= startHour) return null;
  return [{ days: [...days], start_minute: startHour * 60, end_minute: endHour * 60 }];
}

const DAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];

/** Leesbare NL-omschrijving van dagdeel-blokken, bv. "ma–vr 09:00–21:00". */
export function describeDayparting(blocks: unknown): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";
  return (blocks as DaypartBlock[])
    .map((b) => {
      // NL-weekvolgorde: maandag eerst, zondag (Meta-dag 0) achteraan.
      const weekPos = (d: number) => (d === 0 ? 7 : d);
      const days = [...b.days].sort((a, z) => weekPos(a) - weekPos(z));
      // Aaneengesloten reeks (ma–vr)? Dan met een streepje, anders opsommen.
      const consecutive =
        days.length > 2 &&
        days.every((d, i) => i === 0 || weekPos(d) === weekPos(days[i - 1]) + 1);
      const dayLabel = consecutive
        ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}`
        : days.map((d) => DAY_SHORT[d]).join(", ");
      const time = (min: number) =>
        `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      return `${dayLabel} ${time(b.start_minute)}–${time(b.end_minute)}`;
    })
    .join("; ");
}
