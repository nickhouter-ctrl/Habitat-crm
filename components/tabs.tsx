"use client";

/**
 * Lichte, herbruikbare tabs voor drukke detailpagina's. Compound-API zodat de
 * server-gerenderde secties gewoon als children in een <TabPanel> kunnen blijven
 * staan (geen data opnieuw ophalen — alles wordt server-side gerenderd en client-
 * side alleen getoond/verborgen).
 *
 *   <TabsRoot defaultTab="overzicht" ids={["overzicht","gegevens"]}>
 *     … altijd-zichtbare content (bv. KPI-tegels) …
 *     <TabsBar tabs={[{ id, label, icon?, badge? }]} />
 *     <TabPanel id="overzicht"> … </TabPanel>
 *     <TabPanel id="gegevens"> … </TabPanel>
 *   </TabsRoot>
 *
 * De actieve tab wordt in de URL-hash bijgehouden (deep-links + server-actions die
 * met #tab terugkeren blijven op de juiste tab).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TabsCtx = { active: string; setActive: (id: string) => void };
const Ctx = createContext<TabsCtx | null>(null);

export function TabsRoot({
  defaultTab,
  ids,
  children,
  className,
}: {
  defaultTab: string;
  /** Geldige tab-id's — nodig om de URL-hash te valideren. */
  ids?: string[];
  children: ReactNode;
  className?: string;
}) {
  const [active, setActive] = useState(defaultTab);

  // Bij binnenkomst met een #hash (deep-link of terugkeer van een server-action)
  // de bijbehorende tab openen.
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (h && (!ids || ids.includes(h))) setActive(h);
  }, [ids]);

  const change = useCallback((id: string) => {
    setActive(id);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${id}`);
    }
  }, []);

  return <div className={className}><Ctx.Provider value={{ active, setActive: change }}>{children}</Ctx.Provider></div>;
}

export type TabItem = { id: string; label: string; icon?: ReactNode; badge?: ReactNode };

export function TabsBar({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <div role="tablist" className={cn("mb-6 flex gap-0.5 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t) => {
        const on = ctx.active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => ctx.setActive(t.id)}
            className={cn(
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
              on ? "border-accent text-accent" : "border-transparent text-muted hover:border-border hover:text-foreground",
            )}
          >
            {t.icon && <span className="shrink-0 [&_svg]:size-4">{t.icon}</span>}
            {t.label}
            {t.badge != null && t.badge !== 0 && (
              <span
                className={cn(
                  "min-w-4 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                  on ? "bg-accent/15 text-accent" : "bg-background text-muted",
                )}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const ctx = useContext(Ctx);
  const on = ctx?.active === id;
  return (
    <div role="tabpanel" hidden={!on} className={cn(on ? "space-y-5" : "hidden", className)}>
      {children}
    </div>
  );
}
