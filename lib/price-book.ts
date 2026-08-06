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
};

export const DRIVERS: Driver[] = [
  { key: "woonoppervlak_m2", label: "Woonoppervlak", groep: "oppervlaktes", eenheid: "m²" },
  { key: "terras_m2", label: "Terras", groep: "oppervlaktes", eenheid: "m²" },
  { key: "tuin_m2", label: "Tuin", groep: "oppervlaktes", eenheid: "m²" },
  { key: "oprit_m2", label: "Oprit", groep: "oppervlaktes", eenheid: "m²" },
  { key: "aanbouw_m2", label: "Aanbouw", groep: "oppervlaktes", eenheid: "m²" },
  { key: "kelder_m3", label: "Kelder uitgraven", groep: "oppervlaktes", eenheid: "m³" },

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
  { key: "stuc_buiten_m2", label: "Stucwerk buiten / gevel", groep: "wanden", eenheid: "m²" },

  { key: "elektrapunten", label: "Elektrapunten", groep: "techniek", eenheid: "punten" },
  { key: "verlichtingspunten", label: "Verlichtingspunten", groep: "techniek", eenheid: "punten" },
  { key: "aircounits", label: "Airco-units", groep: "techniek", eenheid: "stuks" },
  { key: "warmtepompen", label: "Warmtepompen", groep: "techniek", eenheid: "stuks" },

  { key: "binnendeuren", label: "Binnendeuren", groep: "interieur", eenheid: "stuks" },
  // Per m² kozijnoppervlak (b × h): uit 57 geleverde leveranciersoffertes in
  // het Rebu-CRM komt gemiddeld € 391/m² inkoop — per stuk zegt niets, een
  // schuifpui van 8 m² is geen draaikiepraam van 1,2 m².
  { key: "kozijnen_m2", label: "Kozijnen (oppervlak b×h)", groep: "interieur", eenheid: "m²" },
  { key: "keukens", label: "Keukens", groep: "interieur", eenheid: "stuks" },

  // Per m² wateroppervlak, niet per stuk: een zwembad van 10×5 is anderhalf
  // keer een 8×4 en hoort dus ook anderhalf keer zoveel te kosten.
  { key: "zwembad_m2", label: "Nieuw zwembad (wateroppervlak)", groep: "buiten", eenheid: "m²" },
  { key: "zwembad_renovatie_m2", label: "Zwembad renoveren (wateroppervlak)", groep: "buiten", eenheid: "m²" },
  { key: "hekwerk_m", label: "Hekwerk", groep: "buiten", eenheid: "m" },
  { key: "poorten", label: "Poorten", groep: "buiten", eenheid: "stuks" },
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
