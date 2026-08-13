/**
 * Unit tests voor de planningshelpers van de campagne-UI (brief §7 + §9):
 * tijden worden ingevoerd in Europe/Madrid (incl. zomer-/wintertijd) en
 * dagdelen worden vertaald naar Meta's adset_schedule-blokken.
 */
import { describe, expect, it } from "vitest";

import {
  buildDayparting,
  describeDayparting,
  formatMadrid,
  parseMadridLocal,
} from "../schedule";

describe("parseMadridLocal", () => {
  it("interpreteert zomertijd als UTC+2", () => {
    const d = parseMadridLocal("2026-08-13T14:30");
    expect(d?.toISOString()).toBe("2026-08-13T12:30:00.000Z");
  });

  it("interpreteert wintertijd als UTC+1", () => {
    const d = parseMadridLocal("2026-01-15T14:30");
    expect(d?.toISOString()).toBe("2026-01-15T13:30:00.000Z");
  });

  it("werkt rond de overgang naar zomertijd (29 maart 2026)", () => {
    // 03:30 bestaat op de overgangsdag pas ná de sprong (02:00→03:00, UTC+2).
    const d = parseMadridLocal("2026-03-29T03:30");
    expect(d?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("geeft null voor onbruikbare invoer", () => {
    expect(parseMadridLocal("")).toBeNull();
    expect(parseMadridLocal("13-08-2026 14:30")).toBeNull();
  });
});

describe("formatMadrid", () => {
  it("toont een UTC-tijd terug als Madrid-tijd", () => {
    expect(formatMadrid(new Date("2026-08-13T12:30:00.000Z"))).toMatch(/14:30/);
    expect(formatMadrid(new Date("2026-01-15T13:30:00.000Z"))).toMatch(/14:30/);
  });
});

describe("buildDayparting", () => {
  it("bouwt Meta-blokken met minuten en dagen", () => {
    expect(buildDayparting([1, 2, 3, 4, 5], 9, 21)).toEqual([
      { days: [1, 2, 3, 4, 5], start_minute: 540, end_minute: 1260 },
    ]);
  });

  it("geeft null zonder dagen of bij een lege range", () => {
    expect(buildDayparting([], 9, 21)).toBeNull();
    expect(buildDayparting([1], 21, 9)).toBeNull();
  });
});

describe("describeDayparting", () => {
  it("beschrijft blokken leesbaar in het Nederlands", () => {
    const blocks = buildDayparting([1, 2, 3, 4, 5], 9, 21)!;
    expect(describeDayparting(blocks)).toBe("ma–vr 09:00–21:00");
  });

  it("beschrijft losse dagen", () => {
    const blocks = buildDayparting([6, 0], 10, 14)!;
    expect(describeDayparting(blocks)).toBe("za, zo 10:00–14:00");
  });

  it("is leeg bij niets", () => {
    expect(describeDayparting(null)).toBe("");
    expect(describeDayparting([])).toBe("");
  });
});
