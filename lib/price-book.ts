/**
 * Prijzenboek: de vaste maten ("drivers") waar offerteposten aan hangen.
 *
 * Het idee: je vult één keer de maten van de woning in (m² woonoppervlak,
 * aantal badkamers, m² te slopen wanden, …) en elke actieve prijzenboek-post
 * rekent zichzelf uit als maat × factor × eenheidsprijs. Een post zonder maat
 * (driver "handmatig") krijgt zijn aantal met de hand in de wizard.
 *
 * De lijst staat in code, niet in de database: de wizard moet per driver een
 * invoerveld met label en groep kunnen tonen, en dat hoort versiebeheerd te
 * zijn — een driver hernoemen is een codewijziging, geen datamutatie.
 */

export type DriverGroep = "oppervlaktes" | "sanitair" | "wanden" | "techniek" | "interieur" | "buiten";

export type Driver = {
  key: string;
  label: string;
  groep: DriverGroep;
  /** Eenheid van de maat zelf (m², stuks, …) — puur voor het invoerveld. */
  eenheid: string;
  /** Afgeleide maat: geen invoerveld — de wizard rekent hem uit andere maten. */
  afgeleid?: boolean;
};

export const DRIVERS: Driver[] = [
  { key: "woonoppervlak_m2", label: "Woonoppervlak", groep: "oppervlaktes", eenheid: "m²" },
  { key: "terras_m2", label: "Terras", groep: "oppervlaktes", eenheid: "m²" },
  { key: "tuin_m2", label: "Tuin", groep: "oppervlaktes", eenheid: "m²" },
  { key: "oprit_m2", label: "Oprit", groep: "oppervlaktes", eenheid: "m²" },
  { key: "aanbouw_m2", label: "Aanbouw", groep: "oppervlaktes", eenheid: "m²" },
  { key: "kelder_m3", label: "Kelder uitgraven", groep: "oppervlaktes", eenheid: "m³" },
  { key: "tegelvloer_m2", label: "Tegelvloer", groep: "oppervlaktes", eenheid: "m²" },
  { key: "parket_m2", label: "Parket / laminaat", groep: "oppervlaktes", eenheid: "m²" },
  { key: "spc_m2", label: "SPC / PVC vloer", groep: "oppervlaktes", eenheid: "m²" },
  { key: "microcement_m2", label: "Microcement", groep: "oppervlaktes", eenheid: "m²" },
  { key: "vloerverwarming_m2", label: "Vloerverwarming", groep: "oppervlaktes", eenheid: "m²" },
  { key: "dak_pannen_m2", label: "Dak renoveren (pannen)", groep: "oppervlaktes", eenheid: "m²" },
  { key: "dak_plat_m2", label: "Plat dak waterdicht", groep: "oppervlaktes", eenheid: "m²" },

  // De wizard vraagt dit per badkamer uit (badkamer 1 = 5 m², 1 douche, …)
  // en telt hier de totalen op — de posten rekenen met de sommen.
  { key: "badkamers", label: "Badkamers", groep: "sanitair", eenheid: "stuks" },
  { key: "badkamer_m2", label: "Badkameroppervlak (totaal)", groep: "sanitair", eenheid: "m²" },
  { key: "douches", label: "Douches", groep: "sanitair", eenheid: "stuks" },
  { key: "baden", label: "Baden", groep: "sanitair", eenheid: "stuks" },
  { key: "wastafels", label: "Wastafels", groep: "sanitair", eenheid: "stuks" },
  { key: "toiletten", label: "Toiletten", groep: "sanitair", eenheid: "stuks" },

  { key: "sloop_wanden_m2", label: "Wanden slopen", groep: "wanden", eenheid: "m²" },
  { key: "opbouw_wanden_m2", label: "Wanden opbouwen", groep: "wanden", eenheid: "m²" },
  { key: "stuc_binnen_m2", label: "Stucwerk binnen", groep: "wanden", eenheid: "m²" },
  // Auto: wanden + vloeren + badkamervloeren — voor containers/stortkosten.
  { key: "sloop_totaal_m2", label: "Sloopwerk totaal (automatisch)", groep: "wanden", eenheid: "m²", afgeleid: true },
  { key: "stuc_buiten_m2", label: "Stucwerk buiten / gevel", groep: "wanden", eenheid: "m²" },
  { key: "plafond_m2", label: "Verlaagd plafond (gyproc)", groep: "wanden", eenheid: "m²" },

  { key: "elektrapunten", label: "Elektrapunten", groep: "techniek", eenheid: "punten" },
  { key: "verlichtingspunten", label: "Verlichtingspunten", groep: "techniek", eenheid: "punten" },
  { key: "aircounits", label: "Airco-units", groep: "techniek", eenheid: "stuks" },
  { key: "warmtepompen", label: "Warmtepompen", groep: "techniek", eenheid: "stuks" },
  { key: "zonnepanelen", label: "Zonnepanelen", groep: "techniek", eenheid: "stuks" },
  { key: "kanaalairco_ruimtes", label: "Kanaalairco (ruimtes)", groep: "techniek", eenheid: "stuks" },

  { key: "binnendeuren", label: "Binnendeuren", groep: "interieur", eenheid: "stuks" },
  // Per m² kozijnoppervlak (b × h): uit 57 geleverde leveranciersoffertes in
  // het Rebu-CRM komt gemiddeld € 391/m² inkoop — per stuk zegt niets, een
  // schuifpui van 8 m² is geen draaikiepraam van 1,2 m².
  { key: "kozijnen_m2", label: "Kozijnen (oppervlak b×h)", groep: "interieur", eenheid: "m²" },
  { key: "keukens", label: "Keukens", groep: "interieur", eenheid: "stuks" },
  { key: "wandpanelen_m2", label: "Wandpanelen (eigen collectie)", groep: "interieur", eenheid: "m²" },

  // Per m² wateroppervlak, niet per stuk: een zwembad van 10×5 is anderhalf
  // keer een 8×4 en hoort dus ook anderhalf keer zoveel te kosten.
  { key: "zwembad_m2", label: "Nieuw zwembad (wateroppervlak)", groep: "buiten", eenheid: "m²" },
  { key: "zwembad_renovatie_m2", label: "Zwembad renoveren (wateroppervlak)", groep: "buiten", eenheid: "m²" },
  { key: "hekwerk_m", label: "Hekwerk", groep: "buiten", eenheid: "m" },
  { key: "poorten", label: "Poorten", groep: "buiten", eenheid: "stuks" },
  { key: "pergolas", label: "Pergola / zonwering", groep: "buiten", eenheid: "stuks" },
  { key: "buitenkeukens", label: "Buitenkeuken", groep: "buiten", eenheid: "stuks" },
  { key: "carports", label: "Carport", groep: "buiten", eenheid: "stuks" },
];

export const DRIVER_GROEP_LABEL: Record<DriverGroep, string> = {
  oppervlaktes: "Oppervlaktes",
  sanitair: "Badkamers & sanitair",
  wanden: "Wanden & stucwerk",
  techniek: "Techniek",
  interieur: "Interieur",
  buiten: "Buitenruimte",
};

/** Posten zonder maat: het aantal wordt in de wizard met de hand ingevuld. */
export const DRIVER_HANDMATIG = "handmatig";

export const DRIVER_LABEL = new Map([
  ...DRIVERS.map((d) => [d.key, d.label] as const),
  [DRIVER_HANDMATIG, "handmatig aantal"] as const,
]);

/** Hoofdstukken, in de volgorde waarin ze op de offerte komen. */
export const HOOFDSTUKKEN = [
  "Sloopwerk",
  "Ruwbouw & wanden",
  "Dakwerk",
  "Stucwerk",
  "Schilderwerk",
  "Tegelwerk",
  "Vloeren & plafonds",
  "Badkamers & sanitair",
  "Loodgieterwerk",
  "Elektra",
  "Airco & klimaat",
  "Verlichting",
  "Binnendeuren",
  "Kozijnen",
  "Keuken",
  "Zwembad",
  "Buitenruimte",
  "Hekwerk & poort",
  "Aanbouw & kelder",
  "Eigen producten",
] as const;

export const EENHEDEN = ["m²", "m", "m³", "stuk", "punt", "forfait"] as const;

/** Standaardmarge (van de verkoopprijs) — keuze van Nick, 06-08-2026: ruim. */
export const DEFAULT_PRIJZENBOEK_MARGE = 30;

/* ───────────────────────── badkamer-samenstelling ─────────────────────────
 * De wizard vraagt badkamers per stuk uit (b_aantal, b1_m2, b1_douches, …).
 * Deze helper leest die velden — uit de URL óf uit FormData — en levert de
 * driver-totalen plus de specificatie-tekst voor op de offerte. Eén plek,
 * zodat voorbeeld en aanmaak-actie gegarandeerd hetzelfde rekenen. */

export type BadkamerBlok = { i: number; m2: number; douches: number; baden: number; wastafels: number; toiletten: number };

export const MAX_BADKAMER_BLOKKEN = 12;

export function badkamerSamenstelling(lees: (veldnaam: string) => string) {
  const num = (s: string) => {
    const n = Number(s.trim().replace(",", "."));
    return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const aantal = Math.min(Math.max(Number.parseInt(lees("b_aantal"), 10) || 0, 0), MAX_BADKAMER_BLOKKEN);
  const blokken: BadkamerBlok[] = Array.from({ length: aantal }, (_, idx) => {
    const i = idx + 1;
    const veld = (v: string) => num(lees(`b${i}_${v}`));
    return { i, m2: veld("m2"), douches: veld("douches"), baden: veld("baden"), wastafels: veld("wastafels"), toiletten: veld("toiletten") };
  });
  const som = (k: keyof Omit<BadkamerBlok, "i">) => blokken.reduce((s, b) => s + b[k], 0);
  const totalen: Record<string, number> = {
    badkamers: aantal,
    badkamer_m2: som("m2"),
    douches: som("douches"),
    baden: som("baden"),
    wastafels: som("wastafels"),
    toiletten: som("toiletten"),
  };
  const spec = blokken
    .filter((b) => b.m2 || b.douches || b.baden || b.wastafels || b.toiletten)
    .map((b) => {
      const delen = [
        b.m2 ? `${String(b.m2).replace(".", ",")} m²` : null,
        b.douches ? `${b.douches}× douche` : null,
        b.baden ? `${b.baden}× bad` : null,
        b.wastafels ? `${b.wastafels}× wastafel` : null,
        b.toiletten ? `${b.toiletten}× toilet` : null,
      ].filter(Boolean);
      return `Badkamer ${b.i}: ${delen.join(", ")}`;
    })
    .join(" · ");
  return { blokken, totalen, spec };
}
