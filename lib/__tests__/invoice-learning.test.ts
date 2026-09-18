import { describe, expect, it } from "vitest";

import { bestandPatroon } from "@/lib/invoice-learning";

describe("bestandPatroon", () => {
  it("maakt van cijfers een # zodat terugkerende bestandssoorten samenvallen", () => {
    expect(bestandPatroon("Factuur 2026-118.pdf")).toBe(bestandPatroon("Factuur 2026-119.pdf"));
    expect(bestandPatroon("factura N° 7  WILHELMUS.xlsx")).toBe(bestandPatroon("factura N° 8 WILHELMUS.xlsx"));
  });

  it("houdt verschillende soorten bestanden apart", () => {
    expect(bestandPatroon("attachment.png")).not.toBe(bestandPatroon("factuur 1.pdf"));
    expect(bestandPatroon("JUSTIFICACION HORAS N°3.xlsx")).not.toBe(bestandPatroon("factura N° 3.xlsx"));
  });

  it("geeft een leeg patroon zonder bestandsnaam", () => {
    expect(bestandPatroon(null)).toBe("");
    expect(bestandPatroon(undefined)).toBe("");
  });
});
