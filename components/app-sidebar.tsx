"use client";

import {
  Briefcase,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { signOutAction } from "@/lib/auth/actions";
import { cn, initials } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/contacts", label: "Contacten", icon: Users },
  { href: "/deals", label: "Deals & projecten", icon: Briefcase },
  { href: "/properties", label: "Panden", icon: Building2 },
  { href: "/quotes", label: "Offertes", icon: FileText },
  { href: "/invoices", label: "Facturen", icon: Receipt },
];

export function AppSidebar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role?: string };
}) {
  const pathname = usePathname();
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">
          H
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Habitat CRM</p>
          <p className="text-xs text-muted">Xàbia</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 py-2">
        {NAV.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-foreground hover:bg-background",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-2 py-2">
        <Link
          href="/settings"
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
    </aside>
  );
}
