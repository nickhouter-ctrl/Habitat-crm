"use client";

import {
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
  HardHat,
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
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOutAction } from "@/lib/auth/actions";
import { GlobalSearch } from "@/components/global-search";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/scan", label: "Scannen", icon: ScanLine },
  { href: "/contacts", label: "Contacten", icon: Users },
  { href: "/aanvragen", label: "Aanvragen", icon: Inbox },
  { href: "/accounts", label: "Klant-accounts", icon: UserCog },
  { href: "/leads", label: "Leads", icon: Megaphone },
  { href: "/commissies", label: "Commissies", icon: Percent },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/inbox", label: "Mail-inbox", icon: Mail },
  { href: "/archief", label: "Archief", icon: FileText },
  { href: "/projects", label: "Projecten", icon: Briefcase },
  { href: "/ploeg", label: "Ploeg", icon: HardHat },
  { href: "/properties", label: "Panden", icon: Building2 },
  { href: "/products", label: "Producten", icon: Boxes },
  { href: "/samples", label: "Samples", icon: Layers },
  { href: "/wederverkopers", label: "Wederverkopers", icon: Store },
  { href: "/samplecatalogus", label: "Samplecatalogus", icon: Layers },
  { href: "/prijslijst", label: "Prijslijst", icon: Tag },
  { href: "/catalogi", label: "Catalogi", icon: BookOpen },
  { href: "/bestellen", label: "Bestellen", icon: ShoppingCart },
  { href: "/inkooporders", label: "Inkooporders", icon: PackagePlus },
  { href: "/shipments", label: "Shipments", icon: Boxes },
  { href: "/quotes", label: "Offertes", icon: FileText },
  { href: "/invoices", label: "Facturen", icon: Receipt },
  { href: "/pakbonnen", label: "Pakbonnen", icon: Truck },
  { href: "/leveringen", label: "Leveringen", icon: PackageCheck },
  { href: "/rapporten", label: "Rapporten", icon: BarChart3 },
  { href: "/rapporten/seo", label: "SEO", icon: LineChart },
  { href: "/rapporten/analytics", label: "Analytics", icon: Activity },
  { href: "/rapporten/business", label: "Bedrijfsprofiel", icon: Store },
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

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const navBody = (onNavigate?: () => void) => (
    <>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1 pt-2">
        {NAV.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active ? "bg-accent/10 font-medium text-accent" : "text-foreground hover:bg-background",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
              {(badges[item.href] ?? 0) > 0 && (
                <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                  {badges[item.href] > 99 ? "99+" : badges[item.href]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-2 py-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            isActive("/settings")
              ? "bg-accent/10 font-medium text-accent"
              : "text-foreground hover:bg-background",
          )}
        >
          <Settings className="size-4 shrink-0" />
          Instellingen
        </Link>
      </div>

      <div className="flex items-center gap-2.5 border-t px-3 py-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-background text-xs font-medium text-muted">
          {initials(user.name ?? user.email)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
          <p className="truncate text-xs text-muted">{user.role ?? "agent"}</p>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            title="Uitloggen"
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
          aria-label="Menu openen"
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
                aria-label="Sluiten"
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
