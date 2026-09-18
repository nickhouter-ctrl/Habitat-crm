import { describe, expect, it } from "vitest";

import {
  BOUNCE_GRENS,
  dagCap,
  HARD_MAX,
  inVenster,
  moetStoppen,
  opnieuwNa,
  opwarmDag,
  pauzeMs,
  rondeBudget,
  START_CAP,
  WARMUP_STAPPEN,
} from "@/lib/leads/warmup";

/** Maandag 5 januari 2026, 10:00 Madrid (wintertijd, UTC+1). */
const MAANDAG = new Date("2026-01-05T09:00:00Z");
/** Maandag 6 juli 2026, 10:00 Madrid (zomertijd, UTC+2). */
const ZOMER_MAANDAG = new Date("2026-07-06T08:00:00Z");

const dagenLater = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

describe("opwarmen", () => {
  it("begint voorzichtig als er nog geen startdatum is", () => {
    expect(dagCap(null, MAANDAG)).toBe(START_CAP);
    expect(START_CAP).toBe(200);
  });

  it("loopt de trap af per verzenddag", () => {
    expect(dagCap(MAANDAG, MAANDAG)).toBe(200); // dag 1
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 1))).toBe(200); // dag 2
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 2))).toBe(300); // dag 3
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 4))).toBe(500); // dag 5 (vrijdag)
  });

  it("slaat het weekend over, zodat de trap niet doorloopt terwijl er niets uitgaat", () => {
    // Za 10-01 en zo 11-01 zijn geen verzenddagen; maandag 12-01 is werkdag 6.
    expect(opwarmDag(MAANDAG, dagenLater(MAANDAG, 5))).toBe(5); // zaterdag → nog dag 5
    expect(opwarmDag(MAANDAG, dagenLater(MAANDAG, 7))).toBe(6); // maandag erna
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 7))).toBe(650);
  });

  it("blijft na de laatste trede op het maximum staan", () => {
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 60))).toBe(HARD_MAX);
    expect(WARMUP_STAPPEN[WARMUP_STAPPEN.length - 1]).toBe(HARD_MAX);
  });

  it("laat een handmatige cap omlaag, maar nooit boven het maximum", () => {
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 60), 50)).toBe(50);
    expect(dagCap(MAANDAG, dagenLater(MAANDAG, 60), 99_999)).toBe(HARD_MAX);
    expect(dagCap(MAANDAG, MAANDAG, 0)).toBe(0); // handmatig stilzetten
  });
});

describe("rondeBudget", () => {
  it("houdt zich aan wat er vandaag over is", () => {
    expect(rondeBudget({ cap: 200, vandaagVerstuurd: 187, perRonde: 25 })).toBe(13);
  });

  it("geeft nul als de cap gehaald is", () => {
    expect(rondeBudget({ cap: 200, vandaagVerstuurd: 200, perRonde: 25 })).toBe(0);
    expect(rondeBudget({ cap: 200, vandaagVerstuurd: 250, perRonde: 25 })).toBe(0);
  });

  it("gaat nooit boven wat één ronde aankan", () => {
    expect(rondeBudget({ cap: 1000, vandaagVerstuurd: 0, perRonde: 25 })).toBe(25);
  });
});

describe("verzendvenster", () => {
  const venster = { vanUur: 9, totUur: 18, alleenWerkdagen: true };

  it("rekent op de Madrid-klok, ook in de zomertijd", () => {
    // 08:30 UTC is 09:30 in de winter (binnen) en 10:30 in de zomer (binnen).
    expect(inVenster(new Date("2026-01-15T08:30:00Z"), venster)).toBe(true);
    expect(inVenster(new Date("2026-07-15T08:30:00Z"), venster)).toBe(true);
    // 07:30 UTC is 08:30 in de winter → buiten het venster.
    expect(inVenster(new Date("2026-01-15T07:30:00Z"), venster)).toBe(false);
    // 07:30 UTC is 09:30 in de zomer → binnen.
    expect(inVenster(new Date("2026-07-15T07:30:00Z"), venster)).toBe(true);
  });

  it("sluit het weekend", () => {
    // Zaterdag 17 januari 2026, 11:00 Madrid.
    expect(inVenster(new Date("2026-01-17T10:00:00Z"), venster)).toBe(false);
    expect(inVenster(new Date("2026-01-17T10:00:00Z"), { ...venster, alleenWerkdagen: false })).toBe(true);
  });

  it("sluit de avond", () => {
    expect(inVenster(new Date("2026-01-15T17:30:00Z"), venster)).toBe(false); // 18:30 Madrid
    expect(inVenster(new Date("2026-01-15T16:59:00Z"), venster)).toBe(true); // 17:59 Madrid
  });

  it("werkt ook in de zomer op een maandagochtend", () => {
    expect(inVenster(ZOMER_MAANDAG, venster)).toBe(true);
  });
});

describe("pacing", () => {
  it("blijft binnen ±30% van de ingestelde pauze", () => {
    expect(pauzeMs(6, () => 0)).toBe(4200);
    expect(pauzeMs(6, () => 1)).toBe(7800);
    expect(pauzeMs(6, () => 0.5)).toBe(6000);
  });

  it("loopt de wachttijd op na elke mislukte poging", () => {
    expect(opnieuwNa(1)).toBe(5 * 60_000);
    expect(opnieuwNa(2)).toBe(30 * 60_000);
    expect(opnieuwNa(3)).toBe(120 * 60_000);
    expect(opnieuwNa(9)).toBe(120 * 60_000);
  });
});

describe("noodrem", () => {
  it("zwijgt zolang er te weinig verstuurd is om iets te zeggen", () => {
    expect(moetStoppen({ verstuurd: 100, bounces: 30, klachten: 5 })).toBeNull();
  });

  it("grijpt in boven 4% bounces", () => {
    expect(moetStoppen({ verstuurd: 500, bounces: 19, klachten: 0 })).toBeNull();
    expect(moetStoppen({ verstuurd: 500, bounces: 21, klachten: 0 })).toContain("bouncepercentage");
    expect(BOUNCE_GRENS).toBe(0.04);
  });

  it("grijpt in boven 0,3% klachten", () => {
    expect(moetStoppen({ verstuurd: 1000, bounces: 0, klachten: 4 })).toContain("klachtpercentage");
    expect(moetStoppen({ verstuurd: 1000, bounces: 0, klachten: 2 })).toBeNull();
  });
});
