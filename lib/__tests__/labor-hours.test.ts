import { describe, expect, it } from "vitest";

import { tariefBijUren, urenUitTarief } from "@/lib/labor-hours";

describe("urenUitTarief", () => {
  it("rekent de uren van een echte factuur terug", () => {
    // Ferhaoui 0016/2026: € 4.750 (btw verlegd) bij € 28/u.
    expect(urenUitTarief(4750, 28)).toBe(169.64);
    // Wilhelmus, € 27/u.
    expect(urenUitTarief(1471.5, 27)).toBe(54.5);
  });

  it("geeft niets terug zonder tarief — dan mag er niet gegokt worden", () => {
    expect(urenUitTarief(4750, null)).toBeNull();
    expect(urenUitTarief(4750, 0)).toBeNull();
  });

  it("geeft niets terug zonder bedrag", () => {
    expect(urenUitTarief(0, 28)).toBeNull();
    expect(urenUitTarief(null, 28)).toBeNull();
    expect(urenUitTarief(Number.NaN, 28)).toBeNull();
  });
});

describe("tariefBijUren", () => {
  it("houdt de geboekte kost gelijk aan het factuurbedrag", () => {
    for (const bedrag of [4750, 3350, 1471.5, 2175]) {
      const uren = urenUitTarief(bedrag, 28)!;
      const tarief = tariefBijUren(bedrag, uren);
      expect(Math.round(uren * Number(tarief.toFixed(6)) * 100) / 100).toBe(bedrag);
    }
  });

  it("valt niet om bij nul uren", () => {
    expect(tariefBijUren(100, 0)).toBe(0);
  });
});
