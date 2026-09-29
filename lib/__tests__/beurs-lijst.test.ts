/**
 * De lijst met beurscontacten.
 *
 * Vastleggen gebeurt per gesprek, opvolgen per persoon — en op dag drie staat
 * dezelfde architect zomaar een tweede keer voor je. Deze test bewaakt dat er
 * dan één regel overblijft zonder dat er iets van het eerste gesprek wegvalt,
 * en dat sorteren doet wat de kolomkop belooft.
 */
import { describe, expect, it } from "vitest";

import {
  type BeursGesprek,
  beursCsv,
  filterBeursContacten,
  sorteerBeursContacten,
  verdichtTotContacten,
  wensUitBericht,
} from "@/lib/beurs-lijst";

const gesprek = (o: Partial<BeursGesprek> & { naam: string }): BeursGesprek => ({
  aanvraagId: `a-${o.naam}-${o.wanneer?.toISOString() ?? ""}`,
  contactId: `c-${o.naam}`,
  email: `${o.naam.toLowerCase()}@voorbeeld.es`,
  telefoon: null,
  bedrijf: null,
  bericht: null,
  taal: "es",
  tags: ["beurs:360-cevisama-2026", "rol:architect"],
  wanneer: new Date("2026-09-28T10:00:00Z"),
  plaats: null,
  land: null,
  lat: null,
  lon: null,
  ...o,
});

describe("gesprekken worden personen", () => {
  it("houdt één regel over als iemand twee keer langskomt", () => {
    const rijen = verdichtTotContacten([
      gesprek({ naam: "Carlos", wanneer: new Date("2026-09-28T10:00:00Z"), bericht: "Architect — …\nWil stalen travertijn", telefoon: null }),
      gesprek({ naam: "Carlos", wanneer: new Date("2026-09-30T15:00:00Z"), bericht: "Architect — …\nKomt terug met zijn klant", telefoon: "+34 600" }),
      gesprek({ naam: "Ana", wanneer: new Date("2026-09-29T09:00:00Z") }),
    ]);
    expect(rijen).toHaveLength(2);
    const carlos = rijen.find((r) => r.naam === "Carlos")!;
    expect(carlos.gesprekken).toBe(2);
    // Het laatste gesprek is leidend, maar niets uit het eerste gaat verloren.
    expect(carlos.wanneer?.toISOString()).toContain("2026-09-30");
    expect(carlos.eersteKeer?.toISOString()).toContain("2026-09-28");
    expect(carlos.wens).toContain("travertijn");
    expect(carlos.wens).toContain("terug met zijn klant");
    expect(carlos.telefoon).toBe("+34 600");
  });

  it("ziet de rol en de QR-code in de tags", () => {
    const [r] = verdichtTotContacten([
      gesprek({ naam: "Ana", tags: ["beurs:360-cevisama-2026", "rol:wederverkoper", "beurs:qr"] }),
    ]);
    expect(r.rol).toBe("wederverkoper");
    expect(r.zelfIngevuld).toBe(true);
  });

  it("laat de standregel weg en houdt de wens over", () => {
    expect(wensUitBericht("Architect — gesproken op 360 by Cevisama, stand C109\nZoekt SPC")).toBe("Zoekt SPC");
    expect(wensUitBericht("Alleen de standregel")).toBe("");
    expect(wensUitBericht(null)).toBe("");
  });
});

describe("filteren", () => {
  const rijen = verdichtTotContacten([
    gesprek({ naam: "Carlos", bedrijf: "Estudio Bonet", bericht: "kop\nZoekt travertijn voor Moraira" }),
    gesprek({ naam: "Ana", tags: ["rol:wederverkoper", "beurs:qr"] }),
  ]);

  it("zoekt ook in het bedrijf en in de wens, niet alleen in de naam", () => {
    expect(filterBeursContacten(rijen, { q: "bonet" }).map((r) => r.naam)).toEqual(["Carlos"]);
    expect(filterBeursContacten(rijen, { q: "moraira" }).map((r) => r.naam)).toEqual(["Carlos"]);
  });

  it("scheidt wie het zelf invulde van wie wij intikten", () => {
    expect(filterBeursContacten(rijen, { invoer: "zelf" }).map((r) => r.naam)).toEqual(["Ana"]);
    expect(filterBeursContacten(rijen, { invoer: "wij" }).map((r) => r.naam)).toEqual(["Carlos"]);
  });

  it("filtert op soort bezoeker", () => {
    expect(filterBeursContacten(rijen, { rol: "wederverkoper" }).map((r) => r.naam)).toEqual(["Ana"]);
  });
});

describe("sorteren", () => {
  const rijen = verdichtTotContacten([
    gesprek({ naam: "Carlos", bedrijf: "Zafiro", wanneer: new Date("2026-09-28T10:00:00Z") }),
    gesprek({ naam: "Ana", bedrijf: null, wanneer: new Date("2026-09-30T10:00:00Z") }),
    gesprek({ naam: "Bea", bedrijf: "Álvarez", wanneer: new Date("2026-09-29T10:00:00Z") }),
  ]);

  it("zet standaard het laatste gesprek bovenaan", () => {
    expect(sorteerBeursContacten(rijen, "wanneer", "desc").map((r) => r.naam)).toEqual(["Ana", "Bea", "Carlos"]);
    expect(sorteerBeursContacten(rijen, "wanneer", "asc").map((r) => r.naam)).toEqual(["Carlos", "Bea", "Ana"]);
  });

  it("sorteert op naam zoals een mens dat verwacht — accenten tellen niet mee", () => {
    expect(sorteerBeursContacten(rijen, "naam", "asc").map((r) => r.naam)).toEqual(["Ana", "Bea", "Carlos"]);
    expect(sorteerBeursContacten(rijen, "bedrijf", "asc").map((r) => r.bedrijf)).toEqual(["Álvarez", "Zafiro", null]);
  });

  it("houdt wie geen bedrijf heeft achteraan, ook omgekeerd", () => {
    expect(sorteerBeursContacten(rijen, "bedrijf", "desc").map((r) => r.bedrijf)).toEqual(["Zafiro", "Álvarez", null]);
  });
});

describe("download", () => {
  it("levert een bestand dat Excel in het Spaans meteen goed opent", () => {
    const csv = beursCsv(
      verdichtTotContacten([gesprek({ naam: "Carlos", bedrijf: "Estudio Bonet", bericht: 'kop\nZegt: "mooi"' })]),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\n")[0]).toContain('"Naam";"Bedrijf"');
    // Aanhalingstekens in een wens mogen de kolommen niet uit elkaar trekken.
    expect(csv).toContain('"Zegt: ""mooi"""');
  });
});

describe("anders", () => {
  it("laat zien wat 'anders' dan wél was — anders zegt het antwoord niets", () => {
    const [r] = verdichtTotContacten([
      gesprek({ naam: "Marta", tags: ["rol:anders", "rol-anders:fotograaf"] }),
    ]);
    expect(r.rol).toBe("anders");
    expect(r.rolAnders).toBe("fotograaf");
    expect(beursCsv([r])).toContain("Anders (fotograaf)");
  });
});
