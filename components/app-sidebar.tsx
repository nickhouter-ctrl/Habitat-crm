"use client";

import {
  ChevronRight,
  History,
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LineChart,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  PackageCheck,
  PackagePlus,
  ScanLine,
  Receipt,
  Inbox,
  Calculator,
  Euro,
  HardHat,
  Home,
  Layers,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Users,
  UserCog,
  Percent,
  X,
  HandCoins,
  FileCheck,
  Images,
  Palette,
  Send,
  TrendingUp,
  Radar,
  AppWindow,
  QrCode,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { signOutAction } from "@/lib/auth/actions";
import { useT } from "@/components/taal-provider";
import { magAlles, magPad, ROLE_LABEL, type Role } from "@/lib/auth/modules";
import { ThemaSchakelaar } from "@/components/thema-schakelaar";
import { GlobalSearch } from "@/components/global-search";
import { cn, initials } from "@/lib/utils";

const GROEP_SLEUTEL = "habitat-menu-groepen";

/**
 * Welke groepen staan open? Dat leeft in de localStorage van dit apparaat en
 * niet in de database: het is een voorkeur van één browser, geen bedrijfsdata.
 *
 * Bewust een kleine store met `useSyncExternalStore` in plaats van een effect
 * dat state zet: bij het eerste renderen op de server bestaat localStorage niet,
 * en een effect dat daarna alsnog state zet geeft een tweede render (en een
 * waarschuwing van de React-compiler). Zo leest React de waarde meteen goed.
 */
type Groepstand = Record<string, boolean>;
/**
 * Heb je nog nooit iets in- of uitgeklapt, dan staan deze twee open: het dagwerk
 * (klanten en verkoop). De rest wacht tot je hem nodig hebt. Zodra je zelf iets
 * klapt telt alleen jouw keuze nog.
 */
const STANDAARD_OPEN: Groepstand = { klanten: true, verkoop: true };
let standCache: Groepstand | null = null;
const luisteraars = new Set<() => void>();

function leesStand(): Groepstand {
  if (standCache) return standCache;
  try {
    const rauw = localStorage.getItem(GROEP_SLEUTEL);
    standCache = rauw ? (JSON.parse(rauw) as Groepstand) : STANDAARD_OPEN;
  } catch {
    standCache = STANDAARD_OPEN; // privémodus: dan gewoon de standaardgroepen
  }
  return standCache;
}

function schrijfStand(volgende: Groepstand) {
  standCache = volgende;
  try {
    localStorage.setItem(GROEP_SLEUTEL, JSON.stringify(volgende));
  } catch {
    /* zie boven */
  }
  for (const fn of luisteraars) fn();
}

function abonneer(fn: () => void) {
  luisteraars.add(fn);
  return () => luisteraars.delete(fn);
}

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
/**
 * De zijbalk had elf groepen met vijftig links, allemaal open: te lang om iets
 * in te vinden. De groepen klappen nu in; alleen het bovenste blokje en de
 * groep waar je in zit staan open. Wat je open- of dichtklapt blijft op dit
 * apparaat bewaard.
 *
 * `id` is die onthoud-sleutel — die hangt niet aan het label, zodat een
 * vertaling of een andere naam je opengeklapte groepen niet vergeet.
 */
const NAV_GROUPS: { id: string; label: string | null; items: NavItem[] }[] = [
  // Bovenaan wat je elke dag als eerste opendoet — geen kop, altijd zichtbaar.
  {
    id: "start",
    label: null,
    items: [
      { href: "/", label: "Start", icon: Home, exact: true },
      { href: "/assistent", label: "Assistent", icon: FileCheck },
      { href: "/inbox", label: "Mail-inbox", icon: Mail },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/scan", label: "Scannen", icon: ScanLine },
    ],
  },
  // Wie er zijn, in de volgorde waarin ze binnenkomen: gesproken → aanvraag →
  // vastgelegd → online toegang.
  {
    id: "klanten",
    label: "Klanten",
    items: [
      { href: "/contacts", label: "Contacten", icon: Users },
      { href: "/aanvragen", label: "Aanvragen", icon: Inbox },
      { href: "/beurs", label: "Beursstand", icon: QrCode },
      { href: "/wederverkopers", label: "Wederverkopers", icon: Store },
      { href: "/accounts", label: "Website-accounts", icon: UserCog },
    ],
  },
  {
    id: "projecten",
    label: "Projecten",
    items: [
      { href: "/projects", label: "Projecten", icon: Briefcase },
      { href: "/ploeg", label: "Ploeg", icon: HardHat },
      { href: "/properties", label: "Panden", icon: Building2 },
    ],
  },
  // De weg van een verkoop: calculeren → offerte → voorschot → factuur →
  // commissie. De prijslijsten staan eronder, want die gebruik je erbij.
  {
    id: "verkoop",
    label: "Verkoop",
    items: [
      { href: "/calculator", label: "Offerte-calculator", icon: Calculator },
      { href: "/quotes", label: "Offertes", icon: FileText },
      { href: "/voorschotten", label: "Voorschotten", icon: HandCoins },
      { href: "/invoices", label: "Facturen", icon: Receipt },
      { href: "/commissies", label: "Commissies", icon: Percent },
      { href: "/prijslijst", label: "Prijslijst", icon: Tag },
      { href: "/prijzenboek", label: "Prijzenboek", icon: Euro },
    ],
  },
  // Wat we verkopen: het assortiment zelf, plus wat je klanten meegeeft.
  {
    id: "producten",
    label: "Producten",
    items: [
      { href: "/products", label: "Producten", icon: Boxes },
      { href: "/merken", label: "Merken", icon: Tag },
      { href: "/samples", label: "Samples", icon: Layers },
      { href: "/samplecatalogus", label: "Samplecatalogus", icon: Layers },
      { href: "/catalogi", label: "Catalogi", icon: BookOpen },
    ],
  },
  // Van bestellen tot binnen: dezelfde route die een container aflegt.
  {
    id: "inkoop",
    label: "Inkoop & logistiek",
    items: [
      { href: "/bestellen", label: "Bestellen", icon: ShoppingCart },
      { href: "/inkooporders", label: "Inkooporders", icon: PackagePlus },
      { href: "/inkooporders/te-verwerken", label: "Facturen keuren", icon: FileCheck },
      { href: "/leveranciers", label: "Leveranciers", icon: HardHat },
      { href: "/shipments", label: "Shipments", icon: Boxes },
      { href: "/pakbonnen", label: "Pakbonnen", icon: Truck },
      { href: "/leveringen", label: "Leveringen", icon: PackageCheck },
    ],
  },
  // Kozijnen is een eigen platform met eigen klantaccounts; die twee horen bij
  // elkaar en niet los bij Klanten en Producten.
  {
    id: "kozijnen",
    label: "Kozijnen",
    items: [
      { href: "/kozijnen", label: "Kozijnen", icon: AppWindow },
      { href: "/windows-accounts", label: "Windows-accounts", icon: UserCog },
    ],
  },
  // Zelf naar buiten: eerst de koude lijsten en de mailrondes (Teresa), daarna
  // het advertentiewerk.
  {
    id: "marketing",
    label: "Marketing",
    items: [
      { href: "/leads", label: "Leads", icon: Megaphone },
      { href: "/broadcast", label: "Broadcast", icon: Send },
      { href: "/marketing/campaigns", label: "Campagnes", icon: Send },
      { href: "/marketing/creatives", label: "Creatives", icon: Palette },
      { href: "/marketing/assets", label: "Beeldbibliotheek", icon: Images },
      { href: "/marketing/insights", label: "Wat werkt", icon: TrendingUp },
      { href: "/marketing/competitors", label: "Concurrenten", icon: Radar },
    ],
  },
  // Cijfers en wat er gebeurd is.
  {
    id: "rapporten",
    label: "Cijfers",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/rapporten", label: "Rapporten", icon: BarChart3 },
      { href: "/rapporten/analytics", label: "Analytics", icon: Activity },
      { href: "/rapporten/seo", label: "SEO", icon: LineChart },
      { href: "/rapporten/business", label: "Bedrijfsprofiel", icon: Store },
      { href: "/archief", label: "Archief", icon: FileText },
      { href: "/rapporten/logboek", label: "Logboek", icon: History },
    ],
  },
];

export function AppSidebar({
  user,
  badges = {},
}: {
  user: { name?: string | null; email?: string | null; role?: string };
  /** Per nav-href een teller; toont een badge als > 0. */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useT();
  // Onbekende groep = dicht. Het bovenste blokje en de groep waar je in zit
  // staan altijd open, ongeacht wat hier staat.
  const openGroepen = useSyncExternalStore(abonneer, leesStand, () => STANDAARD_OPEN);
  const klapGroep = (id: string, nu: boolean) => schrijfStand({ ...openGroepen, [id]: !nu });

  // Alleen netheid: de echte grens ligt in app/(app)/layout.tsx en in de guards
  // bij de server actions. Dit voorkomt dode links in het menu.
  const groups = magAlles(user.role)
    ? NAV_GROUPS
    : NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => magPad(user.role, i.href)) })).filter(
        (g) => g.items.length > 0,
      );

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navBody = (onNavigate?: () => void) => (
    <>
      <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-3">
        {groups.map((group) => {
          // Zit je in deze groep, dan staat hij open — anders klik je je eigen
          // pagina weg. Het bovenste blokje (zonder kop) blijft altijd staan.
          const bevatHuidige = group.items.some((i) => isActive(i.href, i.exact));
          const uitgeklapt = !group.label || bevatHuidige || openGroepen[group.id] === true;
          // Tellers van wat er dichtgeklapt onder zit: "Facturen keuren (3)" mag
          // je niet missen doordat de groep dicht staat.
          const groepTeller = group.items.reduce((n, i) => n + (badges[i.href] ?? 0), 0);
          return (
          <div key={group.id} className="space-y-0.5">
            {group.label && (
              <button
                type="button"
                onClick={() => klapGroep(group.id, uitgeklapt)}
                aria-expanded={uitgeklapt}
                className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70 transition-colors hover:bg-background hover:text-foreground"
              >
                <ChevronRight className={cn("size-3 shrink-0 transition-transform", uitgeklapt && "rotate-90")} />
                <span className="truncate">{t(group.label)}</span>
                {!uitgeklapt && groepTeller > 0 && (
                  <span className="ml-auto grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {groepTeller > 99 ? "99+" : groepTeller}
                  </span>
                )}
              </button>
            )}
            {uitgeklapt && group.items.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-background",
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-muted")} />
                  <span className="truncate">{t(item.label)}</span>
                  {(badges[item.href] ?? 0) > 0 && (
                    <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                      {badges[item.href] > 99 ? "99+" : badges[item.href]}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      <div className="flex items-center gap-1 border-t px-2 py-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isActive("/settings")
              ? "bg-accent/10 font-medium text-accent"
              : "text-foreground hover:bg-background",
          )}
        >
          <Settings className="size-4 shrink-0" />
          {t("Instellingen")}
        </Link>
        <ThemaSchakelaar className="ml-auto" />
      </div>

      <div className="flex items-center gap-2.5 border-t px-3 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-background text-xs font-medium text-muted">
          {initials(user.name ?? user.email)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-muted">{t(ROLE_LABEL[user.role as Role] ?? "Medewerker")}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            title={t("Uitloggen")}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-surface lg:flex">
        <div className="px-4 py-4">
          <Image
            src="/brand/habitat-one-logo.png"
            alt="Habitat One"
            width={1000}
            height={560}
            priority
            className="h-11 w-auto"
          />
        </div>
        {navBody()}
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface px-3 lg:hidden">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src="/brand/habitat-one-logo.png"
            alt="Habitat One"
            width={1000}
            height={560}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <GlobalSearch className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Menu openen")}
          className="rounded-md p-2 text-muted transition-colors hover:bg-background hover:text-foreground"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Image
                src="/brand/habitat-one-logo.png"
                alt="Habitat One"
                width={1000}
                height={560}
                className="h-8 w-auto"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("Sluiten")}
                className="rounded-md p-1.5 text-muted transition-colors hover:bg-background"
              >
                <X className="size-5" />
              </button>
            </div>
            {navBody(() => setOpen(false))}
          </div>
        </div>
      )}
    </>
  );
}
