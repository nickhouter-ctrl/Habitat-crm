import { describe, expect, it } from "vitest";

import { verdeelBedragen } from "@/lib/verdeel-bedragen";

const som = (d: { amount: number }[]) => Math.round(d.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe("verdeelBedragen", () => {
  it("verdeelt naar rato van de uren als er geen bedragen staan", () => {
    // Wilhelmus 0-08: € 1.120,50 ex btw over drie werven, alleen uren ingevuld.
    // 41,5 uur à € 27 — dus elk deel komt precies op uren × € 27 uit.
    const uit = verdeelBedragen(
      [{ hours: 20 }, { hours: 15 }, { hours: 6.5 }],
      1120.5,
    );
    expect(uit.map((d) => d.amount)).toEqual([540, 405, 175.5]);
    expect(som(uit)).toBeCloseTo(1120.5, 1);
  });

  it("laat ingevulde bedragen staan en verdeelt alleen de rest", () => {
    const uit = verdeelBedragen([{ amount: 500 }, { hours: 10 }, { hours: 10 }], 1000);
    expect(uit.map((d) => d.amount)).toEqual([500, 250, 250]);
  });

  it("verdeelt gelijk op als niemand uren heeft", () => {
    const uit = verdeelBedragen([{}, {}, {}], 900);
    expect(uit.map((d) => d.amount)).toEqual([300, 300, 300]);
  });

  it("schaalt terug als de ingevulde bedragen boven de factuur uitkomen", () => {
    // Het geval van 0-05: de bedragen incl. btw ingevuld op een factuur van € 877,50.
    const uit = verdeelBedragen([{ amount: 833.09 }, { amount: 98.01 }, { amount: 130.68 }], 877.5);
    expect(som(uit)).toBeCloseTo(877.5, 1);
    expect(uit[0].amount).toBeLessThan(833.09);
  });

  it("raakt niets aan als de bedragen precies kloppen", () => {
    const uit = verdeelBedragen([{ amount: 405 }, { amount: 324 }, { amount: 216 }], 945);
    expect(uit.map((d) => d.amount)).toEqual([405, 324, 216]);
  });

  it("geeft nul als er niets te verdelen valt", () => {
    expect(verdeelBedragen([{ hours: 8 }], 0)[0].amount).toBe(0);
  });
});

describe("verdeelBedragen met een bekend uurtarief", () => {
  it("rekent het bedrag uit uren × tarief — je vult alleen de uren in", () => {
    // Wilhelmus staat in de ploeg met € 27/u; factuur 0-08 is € 1.120,50 ex btw.
    const uit = verdeelBedragen([{ hours: 20 }, { hours: 15 }, { hours: 6.5 }], 1120.5, 27);
    expect(uit.map((d) => d.amount)).toEqual([540, 405, 175.5]);
  });

  it("boekt niet meer dan de factuur, ook niet als er te veel uren staan", () => {
    const uit = verdeelBedragen([{ hours: 30 }, { hours: 30 }], 1120.5, 27);
    expect(Math.round(uit.reduce((s, d) => s + d.amount, 0) * 100) / 100).toBeCloseTo(1120.5, 1);
  });

  it("laat een ingevuld bedrag met rust, ook als er een tarief bekend is", () => {
    const uit = verdeelBedragen([{ hours: 10, amount: 100 }, { hours: 10 }], 1000, 27);
    expect(uit[0].amount).toBe(100);
    expect(uit[1].amount).toBe(270);
  });

  it("valt terug op naar rato als er geen tarief is", () => {
    const uit = verdeelBedragen([{ hours: 1 }, { hours: 3 }], 400, null);
    expect(uit.map((d) => d.amount)).toEqual([100, 300]);
  });
});
