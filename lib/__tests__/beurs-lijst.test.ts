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
  vindDubbeleInvoeren,
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
  it("translates headers, roles and countries while preserving customer notes", () => {
    const rows = verdichtTotContacten([gesprek({ naam: "Carlos", land: "NL", bericht: "kop\nGraag de prijzen", tags: ["rol:architect", "wil:prijzen", "beurs:qr"] })]);
    const en = beursCsv(rows, "en"), es = beursCsv(rows, "es");
    expect(en).toContain('"Name";"Company"');
    expect(en).toContain('"Netherlands"');
    expect(en).toContain('"Prices"');
    expect(es).toContain('"Nombre";"Empresa"');
    expect(es).toContain('"Países Bajos"');
    expect(es).toContain('"Precios"');
    expect(en).toContain('"Graag de prijzen"');
    expect(es).toContain('"Graag de prijzen"');
  });
  it("does not execute spreadsheet formulas from customer input", () => {
    const csv = beursCsv(verdichtTotContacten([gesprek({ naam: "=1+1", bedrijf: "\t@SUM(1)", bericht: "kop\n+cmd" })]));
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'\t@SUM(1)"');
    expect(csv).toContain('"\'+cmd"');
  });
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

describe("dubbele invoeren opsporen", () => {
  const rij = (naam: string, id: string, bericht: string, min: number): BeursGesprek => ({
    ...gesprek({ naam, wanneer: new Date(`2026-09-29T09:${String(min).padStart(2, "0")}:00Z`) }),
    aanvraagId: id,
    email: `${naam.toLowerCase()}@bureau.es`,
    bericht,
  });

  it("vindt twee identieke invoeren vlak na elkaar en houdt de oudste", () => {
    const groepen = vindDubbeleInvoeren([
      rij("Marta", "a1", "Architect — gesproken op…", 38),
      rij("Marta", "a2", "Architect — gesproken op…", 38),
    ]);
    expect(groepen).toHaveLength(1);
    expect(groepen[0].houden).toBe("a1");
    expect(groepen[0].weg).toEqual(["a2"]);
  });

  it("laat een tweede gesprek later op de dag met rust", () => {
    // Zelfde persoon, zelfde tekst, maar een uur later: dat is een echt bezoek.
    const groepen = vindDubbeleInvoeren([
      rij("Marta", "a1", "Architect — gesproken op…", 10),
      { ...rij("Marta", "a2", "Architect — gesproken op…", 10), wanneer: new Date("2026-09-29T11:10:00Z") },
    ]);
    expect(groepen).toHaveLength(0);
  });

  it("laat twee bezoekers met een ander verhaal met rust", () => {
    const groepen = vindDubbeleInvoeren([
      rij("Marta", "a1", "Architect — wil stalen", 38),
      rij("Marta", "a2", "Architect — wil prijzen", 38),
    ]);
    expect(groepen).toHaveLength(0);
  });

  it("raakt verschillende mensen nooit aan", () => {
    expect(
      vindDubbeleInvoeren([rij("Marta", "a1", "zelfde tekst", 38), rij("Alvaro", "a2", "zelfde tekst", 38)]),
    ).toHaveLength(0);
  });
});
