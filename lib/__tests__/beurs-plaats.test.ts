/**
 * Waar de bezoeker zit, en hoe dat op de kaart komt.
 *
 * Op een beursvloer typt niemand een adres in; het is één regel, in de taal van
 * de bezoeker, met een komma als het meezit. Deze test bewaakt dat "Valencia,
 * España" en "Rotterdam, Nederland" allebei als stad + land aankomen, en dat de
 * kaart een bruikbaar stuk wereld laat zien in plaats van alles op één punt.
 */
import { describe, expect, it } from "vitest";

import { bereikVoor, kleurVoor, legenda, perPlaats, speldjes } from "@/lib/beurs-kaart";
import type { BeursContact } from "@/lib/beurs-lijst";
import { leesPlaats, plaatsLabel, splitsPlaats } from "@/lib/plaats";

describe("stad en land uit één regel", () => {
  it("haalt het land eraf, in de taal waarin het getypt is", () => {
    expect(splitsPlaats("Valencia, España")).toMatchObject({ plaats: "Valencia", land: "ES" });
    expect(splitsPlaats("Rotterdam, Nederland")).toMatchObject({ plaats: "Rotterdam", land: "NL" });
    expect(splitsPlaats("München, Germany")).toMatchObject({ plaats: "München", land: "DE" });
  });

  it("houdt een plaats zonder land gewoon heel", () => {
    expect(splitsPlaats("Xàbia")).toMatchObject({ plaats: "Xàbia", land: null });
    // Onbekend land blijft bij de plaats staan — beter iets dan niets.
    expect(splitsPlaats("Praag, Tsjechië")).toMatchObject({ plaats: "Praag, Tsjechië", land: null });
  });

  it("geeft niets terug bij een leeg of zinloos veld", () => {
    expect(splitsPlaats("")).toBeNull();
    expect(splitsPlaats(null)).toBeNull();
    expect(splitsPlaats(" x ")).toBeNull();
  });

  it("schrijft het netjes op het scherm, in de taal van de kijker", () => {
    expect(plaatsLabel("Valencia", "ES")).toBe("Valencia · Spanje");
    expect(plaatsLabel("Valencia", "ES", "es")).toBe("Valencia · España");
    expect(plaatsLabel("Valencia", null)).toBe("Valencia");
    expect(plaatsLabel(null, null)).toBe("");
  });
});

describe("stad uit het veld, land uit de keuzelijst", () => {
  it("laat de keuzelijst winnen van wat er in het stadveld staat", () => {
    // Iemand kiest Nederland maar typt "Valencia, España" — de keuze telt.
    expect(leesPlaats("Valencia, España", "NL")).toMatchObject({ plaats: "Valencia", land: "NL" });
  });

  it("valt terug op de tekst als er geen land gekozen is", () => {
    expect(leesPlaats("Rotterdam, Nederland", "")).toMatchObject({ plaats: "Rotterdam", land: "NL" });
    expect(leesPlaats("Xàbia", null)).toMatchObject({ plaats: "Xàbia", land: null });
  });

  it("negeert een landcode die niet bestaat", () => {
    expect(leesPlaats("Valencia", "XX")).toMatchObject({ plaats: "Valencia", land: null });
  });

  it("houdt alleen een land over als er geen stad is ingevuld", () => {
    expect(leesPlaats("", "ES")).toMatchObject({ plaats: "", land: "ES" });
    expect(leesPlaats("", "")).toBeNull();
  });
});

const contact = (o: Partial<BeursContact> & { naam: string }): BeursContact =>
  ({
    aanvraagId: `a-${o.naam}`,
    contactId: `c-${o.naam}`,
    email: `${o.naam}@voorbeeld.es`,
    telefoon: null,
    bedrijf: null,
    bericht: null,
    taal: "es",
    tags: null,
    wanneer: new Date("2026-09-28T10:00:00Z"),
    plaats: null,
    land: null,
    lat: null,
    lon: null,
    rol: "architect",
    rolAnders: null,
    interesses: [],
    zelfIngevuld: false,
    wens: "",
    gesprekken: 1,
    eersteKeer: null,
    ...o,
  }) as BeursContact;

describe("speldjes op de kaart", () => {
  it("zet twee architecten uit dezelfde stad op één speldje", () => {
    const s = speldjes([
      contact({ naam: "Ana", bedrijf: "Estudio Bonet", plaats: "Valencia", land: "ES", lat: "39.470000", lon: "-0.376800" }),
      contact({ naam: "Bea", bedrijf: "Taller Vera", plaats: "Valencia", land: "ES", lat: "39.470000", lon: "-0.376800" }),
      contact({ naam: "Cees", plaats: "Rotterdam", land: "NL", lat: "51.922500", lon: "4.479200" }),
    ]);
    expect(s).toHaveLength(2);
    const valencia = s.find((p) => p.plaats.startsWith("Valencia"))!;
    expect(valencia.namen).toEqual(["Ana", "Bea"]);
    expect(valencia.bedrijven).toEqual(["Estudio Bonet", "Taller Vera"]);
  });

  it("geeft een aannemer in dezelfde stad een eigen speldje in een andere kleur", () => {
    const s = speldjes([
      contact({ naam: "Ana", rol: "architect", plaats: "Valencia", land: "ES", lat: "39.470000", lon: "-0.376800" }),
      contact({ naam: "Bea", rol: "aannemer", plaats: "Valencia", land: "ES", lat: "39.470000", lon: "-0.376800" }),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0].kleur).not.toBe(s[1].kleur);
  });

  it("houdt dezelfde kleur bij hetzelfde soort bezoeker", () => {
    expect(kleurVoor("architect")).toBe(kleurVoor("architect"));
    expect(kleurVoor("bestaat-niet")).toBe(kleurVoor("anders"));
  });

  it("zet in de legenda elk soort één keer, met het aantal mensen", () => {
    const s = speldjes([
      contact({ naam: "Bea", rol: "aannemer", plaats: "Valencia", land: "ES", lat: "39.47", lon: "-0.3768" }),
      contact({ naam: "Ana", rol: "architect", plaats: "Valencia", land: "ES", lat: "39.47", lon: "-0.3768" }),
      contact({ naam: "Cees", rol: "architect", plaats: "Rotterdam", land: "NL", lat: "51.92", lon: "4.47" }),
    ]);
    expect(legenda(s)).toEqual([
      { rol: "architect", label: "Architect", kleur: kleurVoor("architect"), aantal: 2 },
      { rol: "aannemer", label: "Aannemer / bouwer", kleur: kleurVoor("aannemer"), aantal: 1 },
    ]);
  });

  it("slaat bezoekers zonder coördinaten over — die horen niet op 0,0", () => {
    expect(speldjes([contact({ naam: "Ana", plaats: "Onbekend" })])).toHaveLength(0);
    expect(speldjes([contact({ naam: "Ana", lat: "nogal wat", lon: "raar" })])).toHaveLength(0);
  });
});

describe("wat er in beeld komt", () => {
  it("zoomt niet oneindig in op één bezoeker", () => {
    const b = bereikVoor(speldjes([contact({ naam: "Ana", lat: "39.47", lon: "-0.3768" })]))!;
    // Een graad of vijf met wat lucht eromheen: je ziet waar de stad ligt, en
    // verder inzoomen doe je op de kaart zelf.
    expect(b.east - b.west).toBeGreaterThanOrEqual(5);
    expect(b.north - b.south).toBeGreaterThanOrEqual(5);
  });

  it("past zich aan als er iemand ver weg zit", () => {
    const b = bereikVoor(
      speldjes([
        contact({ naam: "Ana", lat: "39.47", lon: "-0.3768" }),
        contact({ naam: "Cees", lat: "51.92", lon: "4.4792" }),
      ]),
    )!;
    expect(b.south).toBeLessThan(39.47);
    expect(b.north).toBeGreaterThan(51.92);
    expect(b.north).toBeLessThanOrEqual(85);
  });

  it("geeft niets terug als niemand een plaats heeft", () => {
    expect(bereikVoor([])).toBeNull();
  });
});

describe("lijstje per stad", () => {
  it("zet de drukste stad bovenaan", () => {
    const rijen = [
      contact({ naam: "Ana", plaats: "Valencia", land: "ES" }),
      contact({ naam: "Bea", plaats: "Valencia", land: "ES" }),
      contact({ naam: "Cees", plaats: "Rotterdam", land: "NL" }),
      contact({ naam: "Dirk" }),
    ];
    expect(perPlaats(rijen)).toEqual([
      { plaats: "Valencia · Spanje", aantal: 2 },
      { plaats: "Rotterdam · Nederland", aantal: 1 },
    ]);
  });
});


describe("adreslocaties op de kaart", () => {
  it("houdt afzonderlijke huisnummers binnen 100 meter uit elkaar", () => {
    const pins = speldjes([
      contact({ naam: "A", lat: "40.421801", lon: "-3.693101" }),
      contact({ naam: "B", lat: "40.421899", lon: "-3.693199" }),
    ]);
    expect(pins).toHaveLength(2);
  });
  it("noemt een adres alleen precies na bevestiging van de coördinaten", () => {
    const pins = speldjes([
      contact({ naam: "A", lat: "40", lon: "-3", adres: "Calle Prim 12", tags: ["geo:adres-bevestigd"] }),
      contact({ naam: "B", lat: "41", lon: "-3", adres: "Calle Prim 12" }),
    ]);
    expect(pins[0].contacten[0].exact).toBe(true);
    expect(pins[1].contacten[0].exact).toBe(false);
  });
});
