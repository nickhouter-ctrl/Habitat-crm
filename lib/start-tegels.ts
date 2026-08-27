/**
 * De tegels van de persoonlijke startpagina: alle functies van het CRM als
 * grote knoppen, geordend op werkvolgorde (klantcontact → offerte → project →
 * inkoop → facturatie → producten → marketing → rapporten & beheer).
 *
 * Per gebruiker overschrijfbaar via `users.startPrefs` (pin/verberg/volgorde);
 * de prefs zijn een overlay op deze lijst — nieuwe tegels verschijnen vanzelf,
 * onbekende keys in oude prefs worden genegeerd. Key = href (stabiel).
 *
 * Bewust géén "server-only": de client-grid importeert dit bestand ook.
 */
import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  Calculator,
  Euro,
  FileCheck,
  FileText,
  HandCoins,
  HardHat,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  Layers,
  LineChart,
  Mail,
  Megaphone,
  PackageCheck,
  PackagePlus,
  Palette,
  Percent,
  Radar,
  Receipt,
  ScanLine,
  Send,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StartTegel {
  /** Stabiele sleutel voor de prefs — gelijk aan de route. */
  key: string;
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  groep: string;
}

export interface StartPrefs {
  pinned?: string[];
  hidden?: string[];
  order?: string[];
}

const t = (href: string, label: string, desc: string, icon: LucideIcon, groep: string): StartTegel => ({
  key: href,
  href,
  label,
  desc,
  icon,
  groep,
});

export const START_TEGELS: StartTegel[] = [
  // 1 — Klantcontact: waar de werkdag begint.
  t("/inbox", "Mail-inbox", "Binnengekomen mail en bijlagen verwerken", Mail, "Klantcontact"),
  t("/aanvragen", "Aanvragen", "Offerte-aanvragen via de website", Inbox, "Klantcontact"),
  t("/agenda", "Agenda", "Afspraken en taken van het team", CalendarDays, "Klantcontact"),
  t("/contacts", "Contacten", "Alle klanten en relaties", Users, "Klantcontact"),
  t("/leads", "Leads", "Campagnes en op te volgen leads", Megaphone, "Klantcontact"),
  t("/accounts", "Klant-accounts", "Portaal-toegang voor klanten", UserCog, "Klantcontact"),
  // 2 — Offerte maken & versturen.
  t("/quotes", "Offertes", "Offertes opstellen en versturen", FileText, "Offerte & verkoop"),
  t("/calculator", "Offerte-calculator", "Snel calculeren vanuit het prijzenboek", Calculator, "Offerte & verkoop"),
  t("/prijzenboek", "Prijzenboek", "Posten en prijzen voor renovaties", Euro, "Offerte & verkoop"),
  t("/prijslijst", "Prijslijst", "Verkoopprijzen en brochures", Tag, "Offerte & verkoop"),
  t("/catalogi", "Catalogi", "Leveranciers- en productcatalogi", BookOpen, "Offerte & verkoop"),
  // 3 — Projecten & uitvoering.
  t("/projects", "Projecten", "Lopende klussen: voortgang, uren en kosten", Briefcase, "Projecten & uitvoering"),
  t("/ploeg", "Ploeg", "Bouwploeg en urenportalen", HardHat, "Projecten & uitvoering"),
  t("/properties", "Panden", "Panden en woningen in beheer", Building2, "Projecten & uitvoering"),
  // 4 — Inkoop & logistiek.
  t("/bestellen", "Bestellen", "Tekorten bijbestellen bij leveranciers", ShoppingCart, "Inkoop & logistiek"),
  t("/inkooporders/te-verwerken", "Facturen keuren", "Binnengekomen inkoopfacturen goedkeuren", FileCheck, "Inkoop & logistiek"),
  t("/inkooporders", "Inkooporders", "Bestellingen en aankopen per project", PackagePlus, "Inkoop & logistiek"),
  t("/leveranciers", "Leveranciers", "Wat er per leverancier loopt", HardHat, "Inkoop & logistiek"),
  t("/shipments", "Shipments", "Containers en zendingen onderweg", Boxes, "Inkoop & logistiek"),
  t("/pakbonnen", "Pakbonnen", "Pakbonnen maken en printen", Truck, "Inkoop & logistiek"),
  t("/leveringen", "Leveringen", "Leveringen plannen en afvinken", PackageCheck, "Inkoop & logistiek"),
  // 5 — Facturatie & geld.
  t("/invoices", "Facturen", "Verkoopfacturen en herinneringen", Receipt, "Facturatie & geld"),
  t("/voorschotten", "Voorschotten", "Aanbetalingen en voorschotverzoeken", HandCoins, "Facturatie & geld"),
  t("/commissies", "Commissies", "Commissie-afspraken en uitbetalingen", Percent, "Facturatie & geld"),
  // 6 — Producten & voorraad.
  t("/products", "Producten", "Catalogus, voorraad en prijzen", Boxes, "Producten & voorraad"),
  t("/scan", "Scannen", "Barcode scannen: voorraad af- of bijboeken", ScanLine, "Producten & voorraad"),
  t("/samples", "Samples", "Sample-voorraad en uitgiftes", Layers, "Producten & voorraad"),
  t("/samplecatalogus", "Samplecatalogus", "De leverancierscollectie doorbladeren", Layers, "Producten & voorraad"),
  t("/wederverkopers", "Wederverkopers", "Dealers en hun condities", Store, "Producten & voorraad"),
  // 7 — Marketing.
  t("/marketing/assets", "Beeldbibliotheek", "Foto's en video's voor campagnes", Images, "Marketing"),
  t("/marketing/creatives", "Creatives", "Advertentiebeelden maken", Palette, "Marketing"),
  t("/marketing/campaigns", "Campagnes", "Meta-campagnes beheren", Send, "Marketing"),
  t("/marketing/insights", "Wat werkt", "Welke advertenties presteren", TrendingUp, "Marketing"),
  t("/marketing/competitors", "Concurrenten", "Wat de concurrentie adverteert", Radar, "Marketing"),
  // 8 — Rapporten & beheer.
  t("/dashboard", "Dashboard", "Cijfers: omzet, marge en pijplijn", LayoutDashboard, "Rapporten & beheer"),
  t("/rapporten", "Rapporten", "Overzichten en analyses", BarChart3, "Rapporten & beheer"),
  t("/rapporten/seo", "SEO", "Vindbaarheid van de website", LineChart, "Rapporten & beheer"),
  t("/rapporten/analytics", "Analytics", "Websitebezoek en gedrag", Activity, "Rapporten & beheer"),
  t("/rapporten/logboek", "Logboek", "Wie deed wat in het systeem", History, "Rapporten & beheer"),
  t("/archief", "Archief", "Documentenarchief", FileText, "Rapporten & beheer"),
  t("/settings", "Instellingen", "Team, rollen en systeeminstellingen", Settings, "Rapporten & beheer"),
];

/** Volgorde van de groepskopjes = volgorde van eerste voorkomen in START_TEGELS. */
export const START_GROEPEN = [...new Set(START_TEGELS.map((x) => x.groep))];

/**
 * Standaard-hoofdknoppen: het dagelijkse werk, groot bovenaan. Zodra een
 * gebruiker zelf tegels vastpint, vervangen die deze selectie.
 */
export const STANDAARD_HOOFDKNOPPEN = [
  "/inbox",
  "/aanvragen",
  "/quotes",
  "/projects",
  "/invoices",
  "/inkooporders/te-verwerken",
  "/inkooporders",
  "/agenda",
  "/dashboard",
];

const geldigeKeys = new Set(START_TEGELS.map((x) => x.key));

/** Schoon prefs op: alleen bekende keys, geen dubbelen. */
export function normalizeStartPrefs(prefs: StartPrefs | null | undefined): StartPrefs {
  const clean = (arr?: string[]) => [...new Set((arr ?? []).filter((k) => geldigeKeys.has(k)))];
  return { pinned: clean(prefs?.pinned), hidden: clean(prefs?.hidden), order: clean(prefs?.order) };
}

/**
 * Pas de per-gebruiker-prefs toe op de standaardlijst.
 * - `volgorde`: alle tegels (incl. verborgen — voor de bewerk-modus) in de
 *   gekozen volgorde; tegels zonder plek in `order` volgen in standaardvolgorde.
 * - `pinned`: vastgepinde, zichtbare tegels in pin-volgorde.
 * - `zichtbaar`: volgorde minus verborgen minus vastgepind (voor het gegroepeerde grid).
 */
export function applyStartPrefs(prefs: StartPrefs | null | undefined): {
  volgorde: StartTegel[];
  pinned: StartTegel[];
  zichtbaar: StartTegel[];
  hidden: Set<string>;
} {
  const p = normalizeStartPrefs(prefs);
  const byKey = new Map(START_TEGELS.map((x) => [x.key, x]));
  const inOrder = (p.order ?? []).map((k) => byKey.get(k)!).filter(Boolean);
  const restKeys = new Set(inOrder.map((x) => x.key));
  const volgorde = [...inOrder, ...START_TEGELS.filter((x) => !restKeys.has(x.key))];
  const hidden = new Set(p.hidden);
  const pinnedSet = new Set(p.pinned);
  const pinned = (p.pinned ?? []).map((k) => byKey.get(k)!).filter((x) => x && !hidden.has(x.key));
  const zichtbaar = volgorde.filter((x) => !hidden.has(x.key) && !pinnedSet.has(x.key));
  return { volgorde, pinned, zichtbaar, hidden };
}
