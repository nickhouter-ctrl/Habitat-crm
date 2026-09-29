/**
 * De btw van een bon vastleggen.
 *
 * Aanleiding: een contant betaalde bon van Ahmed van € 3.091,67 zonder btw
 * erop. Het CRM nam 21% aan (voor een arbeidsfactuur van een ploeg is dat
 * juister dan het totaal als kost boeken) en boekte € 2.555,10 op de werven.
 * Corrigeerde je dat met de hand, dan rekende de volgende herberekening het
 * weer terug — "ik pas het bedrag aan en het verandert meteen".
 */
import { describe, expect, it } from "vitest";

import { isBtwKeuze, schaalVerdeling, splitsBtw } from "@/lib/inkoop-btw";

describe("btw splitsen", () => {
  it("houdt bij een bon zonder btw het hele bedrag als kost", () => {
    expect(splitsBtw(3091.67, "geen")).toEqual({ subtotal: 3091.67, tax: 0 });
  });

  it("rekent 21% eruit en laat de som exact het betaalde bedrag zijn", () => {
    const { subtotal, tax } = splitsBtw(3091.67, "21");
    expect(subtotal).toBe(2555.1);
    expect(subtotal + tax).toBeCloseTo(3091.67, 2);
  });

  it("kent ook de lagere Spaanse tarieven", () => {
    expect(splitsBtw(110, "10").subtotal).toBe(100);
    expect(splitsBtw(104, "4").subtotal).toBe(100);
  });

  it("valt niet om op een leeg of vreemd totaal", () => {
    expect(splitsBtw(null, "geen")).toEqual({ subtotal: 0, tax: 0 });
    expect(splitsBtw("nogal wat", "21")).toEqual({ subtotal: 0, tax: 0 });
  });

  it("neemt alleen tarieven aan die we kennen", () => {
    expect(isBtwKeuze("geen")).toBe(true);
    expect(isBtwKeuze("21")).toBe(true);
    expect(isBtwKeuze("7")).toBe(false);
  });
});

describe("werfverdeling meeschalen", () => {
  it("houdt de verhouding en komt exact op het nieuwe bedrag uit", () => {
    // De twee werven van Ahmed: 1.290,11 + 1.264,99 op basis van 2.555,10.
    const nieuw = schaalVerdeling([1290.11, 1264.99], 3091.67);
    expect(nieuw.reduce((s, n) => s + n, 0)).toBeCloseTo(3091.67, 2);
    expect(nieuw[0]).toBeGreaterThan(nieuw[1]);
    // Zelfde verhouding als eerst.
    expect(nieuw[0] / nieuw[1]).toBeCloseTo(1290.11 / 1264.99, 3);
  });

  it("laat geen cent verdwijnen bij een lastige verhouding", () => {
    const nieuw = schaalVerdeling([1, 1, 1], 100);
    expect(nieuw.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it("verdeelt gelijk als er nog niets stond", () => {
    expect(schaalVerdeling([0, 0], 100)).toEqual([50, 50]);
  });

  it("geeft niets terug zonder regels", () => {
    expect(schaalVerdeling([], 100)).toEqual([]);
  });
});
