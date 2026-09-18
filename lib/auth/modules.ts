/**
 * Wie mag waar bij — één tabel, voor het hele CRM.
 *
 * Tot nu toe gold: ingelogd is ingelogd, en de enige beperking was "viewer mag
 * niets wijzigen". Met een medewerker die alleen e-mailmarketing en klantcontact
 * doet, is dat te grof. Daarom deze tabel: modules met hun paden, per rol welke
 * modules open staan, en per rol wat iemand mag zien (bedragen) en doen (schrijven,
 * teambeheer).
 *
 * Waarom in code en niet in de database:
 * - de edge-laag (`auth.config.ts`) kan geen database raken, maar wel dit bestand;
 * - een tabel in code is te typen, te reviewen in een pull request en te testen;
 * - een extra rol kost één regel in ROLE_MODULES.
 *
 * Dit bestand blijft daarom PUUR: geen database, geen server-only, geen imports.
 * Het wordt ook door client-componenten (zijbalk, starttegels) gebruikt.
 *
 * De harde grens ligt niet hier maar in `app/(app)/layout.tsx` (pagina's),
 * `lib/auth/guards.ts` (server actions) en `lib/auth/api-guard.ts` (API-routes) —
 * die lezen de rol uit de database. Het menu filteren is alleen netheid.
 */

export const ROLES = ["admin", "agent", "marketing", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type ModuleKey =
  // voor iedereen
  | "start"
  | "eigen-account"
  | "zoeken"
  // klantcontact en marketing
  | "inbox"
  | "contacts"
  | "aanvragen"
  | "leads"
  | "broadcast"
  | "assistent"
  | "agenda"
  | "advertenties"
  // afgeschermd
  | "projects"
  | "properties"
  | "verkoop"
  | "facturatie"
  | "inkoop"
  | "producten"
  | "prijzen"
  | "calculator"
  | "commissies"
  | "dashboard"
  | "rapporten"
  | "kozijnen"
  | "archief"
  | "klantaccounts"
  | "teambeheer";

export type Capability =
  /** Mag geld zien: omzet, marge, kostprijs, openstaande facturen. */
  | "bedragen"
  /** Mag wijzigen (alles behalve viewer). */
  | "schrijven"
  /** Mag medewerkers beheren. */
  | "teambeheer";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  /** Padprefixen die bij deze module horen. De langste prefix wint. */
  paths: string[];
}

/**
 * Elk pad achter de login hoort bij precies één module. Een nieuw pad hier
 * toevoegen, anders valt het in de vangnetmodule (`dashboard`) en is het alleen
 * voor admin en agent zichtbaar. De test in `lib/__tests__/modules.test.ts` faalt
 * als er een pad ontbreekt.
 */
export const MODULES: ModuleDef[] = [
  { key: "start", label: "Startpagina", paths: ["/"] },
  { key: "eigen-account", label: "Eigen account", paths: ["/settings", "/handleiding"] },
  { key: "zoeken", label: "Zoeken", paths: ["/search"] },

  { key: "inbox", label: "Mail", paths: ["/inbox", "/sent-mail"] },
  { key: "contacts", label: "Contacten", paths: ["/contacts"] },
  { key: "aanvragen", label: "Website-aanvragen", paths: ["/aanvragen"] },
  { key: "leads", label: "Leads", paths: ["/leads"] },
  { key: "broadcast", label: "Broadcast", paths: ["/broadcast"] },
  { key: "assistent", label: "Assistent", paths: ["/assistent"] },
  { key: "agenda", label: "Agenda", paths: ["/agenda"] },
  { key: "advertenties", label: "Advertenties", paths: ["/marketing"] },

  { key: "projects", label: "Projecten", paths: ["/projects", "/ploeg", "/deals"] },
  { key: "properties", label: "Panden", paths: ["/properties"] },
  { key: "verkoop", label: "Offertes", paths: ["/quotes", "/documents", "/draairichtingen"] },
  { key: "facturatie", label: "Facturen", paths: ["/invoices", "/voorschotten"] },
  {
    key: "inkoop",
    label: "Inkoop en logistiek",
    paths: ["/bestellen", "/inkooporders", "/leveranciers", "/leveringen", "/shipments", "/pakbonnen"],
  },
  {
    key: "producten",
    label: "Producten",
    paths: [
      "/products",
      "/merken",
      "/samples",
      "/samplecatalogus",
      "/wederverkopers",
      "/scan",
      "/labels",
      "/print-labels",
    ],
  },
  { key: "prijzen", label: "Prijzen", paths: ["/prijzenboek", "/prijslijst", "/catalogi"] },
  { key: "calculator", label: "Calculator", paths: ["/calculator"] },
  { key: "commissies", label: "Commissies", paths: ["/commissies"] },
  { key: "dashboard", label: "Dashboard", paths: ["/dashboard"] },
  { key: "rapporten", label: "Rapporten", paths: ["/rapporten"] },
  { key: "kozijnen", label: "Kozijnen", paths: ["/kozijnen"] },
  { key: "archief", label: "Archief", paths: ["/archief"] },
  { key: "klantaccounts", label: "Klanttoegang", paths: ["/accounts", "/windows-accounts"] },
  // Geen eigen pad: het medewerkersblok zit binnen /settings.
  { key: "teambeheer", label: "Medewerkers", paths: [] },
];

/** Onbekend pad: dicht voor de beperkte rollen. */
export const FALLBACK_MODULE: ModuleKey = "dashboard";

/** `"*"` = alles mag. Bestaande rollen houden bewust volledige toegang. */
export const ROLE_MODULES: Record<Role, readonly ModuleKey[] | "*"> = {
  admin: "*",
  agent: "*",
  viewer: "*",
  marketing: [
    "start",
    "eigen-account",
    "zoeken",
    "inbox",
    "contacts",
    "aanvragen",
    "leads",
    "broadcast",
    "assistent",
    "agenda",
  ],
};

export const ROLE_CAPS: Record<Role, readonly Capability[]> = {
  admin: ["bedragen", "schrijven", "teambeheer"],
  agent: ["bedragen", "schrijven"],
  viewer: ["bedragen"],
  // Marketing mag binnen haar modules alles wijzigen, maar ziet geen geld.
  marketing: ["schrijven"],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Beheerder",
  agent: "Medewerker",
  marketing: "Marketing en klantcontact",
  viewer: "Alleen lezen",
};

/** Paden gesorteerd op lengte, zodat /inkooporders/te-verwerken vóór /inkooporders komt. */
const SORTED_PATHS: ReadonlyArray<readonly [string, ModuleKey]> = MODULES.flatMap((m) =>
  m.paths.filter((p) => p !== "/").map((p) => [p, m.key] as const),
).sort((a, b) => b[0].length - a[0].length);

const isRole = (rol: unknown): rol is Role => typeof rol === "string" && (ROLES as readonly string[]).includes(rol);

/**
 * Kent deze build deze rol? De edge-laag gebruikt dit om níet te beslissen over
 * een rol uit een oud sessiecookie die hier onbekend is: dan laat de edge door
 * en beslist de layout, die de rol uit de database leest. Anders zou één
 * uitrolmoment iedereen met een oud cookie buitensluiten.
 */
export function bekendeRol(rol: unknown): rol is Role {
  return isRole(rol);
}

/**
 * Pad naar module. Exacte match of een echte submap — nooit een naakte
 * `startsWith`, want dan zou /leadsxyz onder /leads vallen.
 */
export function moduleVoorPad(pathname: string): ModuleKey {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "start";
  for (const [prefix, key] of SORTED_PATHS) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return key;
  }
  return FALLBACK_MODULE;
}

/**
 * Staat er een echte regel voor dit pad, of valt het in het vangnet? Alleen de
 * test gebruikt dit: die leest alle pagina's en routes onder `app/(app)/` in en
 * eist dat elk pad een regel heeft. Zo valt een nieuwe map luid door de mand in
 * plaats van stil open te staan.
 */
export function padHeeftRegel(pathname: string): boolean {
  const p = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  return SORTED_PATHS.some(([prefix]) => p === prefix || p.startsWith(`${prefix}/`));
}

export function magModule(rol: unknown, key: ModuleKey): boolean {
  if (!isRole(rol)) return false;
  const toegestaan = ROLE_MODULES[rol];
  return toegestaan === "*" || toegestaan.includes(key);
}

export function magPad(rol: unknown, pathname: string): boolean {
  return magModule(rol, moduleVoorPad(pathname));
}

export function heeftCap(rol: unknown, cap: Capability): boolean {
  if (!isRole(rol)) return false;
  return ROLE_CAPS[rol].includes(cap);
}

/** Heeft deze rol overal toegang? Dan hoeft er niets gefilterd te worden. */
export function magAlles(rol: unknown): boolean {
  return isRole(rol) && ROLE_MODULES[rol] === "*";
}

/** Waar iemand heen gaat na een verboden pad. */
export function startPadVoorRol(rol: unknown): string {
  return magModule(rol, "start") ? "/" : "/login";
}
