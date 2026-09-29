/**
 * De prijsafspraak voor verkooppunten.
 *
 * Dit is een derde prijsniveau, náást de B2B-prijzen voor architecten en
 * bouwbedrijven: een verkooppunt koopt in om door te verkopen en krijgt daarom
 * een betere prijs. De adviesprijs ligt vast, dus de marge van het verkooppunt
 * ligt ook vast — dat is precies waarom deze som hier apart en getest staat.
 */
import { describe, expect, it } from "vitest";

import {
  KORTING_SHOWROOM,
  KORTING_VERKOOPPUNT,
  afrondPrijs,
  distributeurPrijzen,
  margeVerkooppunt,
} from "@/lib/distributeur-prijzen";

describe("kortingen", () => {
  it("staan op de afgesproken percentages", () => {
    expect(KORTING_VERKOOPPUNT).toBe(50);
    expect(KORTING_SHOWROOM).toBe(70);
  });
});

describe("prijs voor een verkooppunt", () => {
  it("is de helft van de adviesprijs", () => {
    const p = distributeurPrijzen(100)!;
    expect(p.adviesEx).toBe(100);
    expect(p.verkooppunt).toBe(50);
    expect(p.showroom).toBe(30);
  });

  it("rekent de btw erbij voor de adviesprijs", () => {
    expect(distributeurPrijzen(100)!.adviesIncl).toBe(121);
  });

  it("rondt naar beneden af op vijf cent — nooit meer dan de halve prijs", () => {
    // 49,95 / 2 = 24,975 → 24,95, niet 25,00.
    const p = distributeurPrijzen(49.95)!;
    expect(p.verkooppunt).toBe(24.95);
    expect(p.verkooppunt).toBeLessThanOrEqual(49.95 / 2);
    expect(afrondPrijs(24.975)).toBe(24.95);
  });

  it("geeft niets terug zonder bruikbare adviesprijs", () => {
    expect(distributeurPrijzen(0)).toBeNull();
    expect(distributeurPrijzen(null)).toBeNull();
    expect(distributeurPrijzen(Number.NaN)).toBeNull();
  });

  it("laat zien wat het verkooppunt verdient bij doorverkoop", () => {
    expect(margeVerkooppunt(distributeurPrijzen(100)!)).toBe(50);
    expect(margeVerkooppunt(distributeurPrijzen(49.95)!)).toBe(25);
  });
});
