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
 *
 * Genest gebruik: geef de BINNENSTE tabs een `param` mee. Ze schrijven hun keuze
 * dan in een zoekparameter (`?lijst=kosten`) in plaats van in de hash, zodat de
 * buitenste tabs eigenaar van de hash blijven — anders overschrijft de binnenste
 * de hash en valt de buitenste na een herlaad terug op zijn standaardtab.
 * Schakelen blijft client-side (alleen `replaceState`), dus zonder serverronde.
 */
import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type TabsCtx = { active: string; setActive: (id: string) => void; prefix: string };
const Ctx = createContext<TabsCtx | null>(null);

export function TabsRoot({
  defaultTab,
  ids,
  children,
  className,
  param,
}: {
  defaultTab: string;
  /** Geldige tab-id's — nodig om de URL-hash te valideren. */
  ids?: string[];
  children: ReactNode;
  className?: string;
  /** Zoekparameter i.p.v. de hash (voor geneste tabs), bv. "lijst". */
  param?: string;
}) {
  const [active, setActive] = useState(defaultTab);
  const prefix = useId();

  // Bij binnenkomst met een #hash (deep-link of terugkeer van een server-action)
  // de bijbehorende tab openen.
  useEffect(() => {
    const applyLocation = (url: URL) => {
      let gevraagd: string | null = null;
      try { gevraagd = param ? url.searchParams.get(param) : decodeURIComponent(url.hash.replace(/^#/, "")); } catch { /* malformed link: keep the default */ }
      // Older links can still point to an element inside a newly grouped tab.
      if (url.hash) {
        try {
          const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
          const panel = target?.closest(`[data-tab-owner="${CSS.escape(prefix)}"]`);
          gevraagd = panel?.getAttribute("data-tab-panel") ?? gevraagd;
        } catch { /* malformed anchor: keep the default */ }
      }
      setActive(gevraagd && (!ids || ids.includes(gevraagd)) ? gevraagd : defaultTab);
    };
    const read = () => applyLocation(new URL(window.location.href));
    // Next's client navigation can update an anchor with pushState, which does
    // not emit hashchange. Reveal its destination before the link navigates.
    const clicked = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname && url.hash) applyLocation(url);
    };
    read();
    window.addEventListener("hashchange", read);
    window.addEventListener("popstate", read);
    document.addEventListener("click", clicked, true);
    return () => { window.removeEventListener("hashchange", read); window.removeEventListener("popstate", read); document.removeEventListener("click", clicked, true); };
  }, [ids, param, prefix, defaultTab]);

  const change = useCallback(
    (id: string) => {
      setActive(id);
      if (typeof window === "undefined") return;
      if (param) {
        const url = new URL(window.location.href);
        url.searchParams.set(param, id);
        try {
          const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
          const panel = target?.closest(`[data-tab-owner="${CSS.escape(prefix)}"]`);
          if (panel && panel.getAttribute("data-tab-panel") !== id) {
            url.hash = panel.parentElement?.closest("[data-tab-panel]")?.getAttribute("data-tab-panel") ?? "";
          }
        } catch { /* malformed anchor does not prevent changing tabs */ }
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      } else {
        history.replaceState(null, "", `#${id}`);
      }
    },
    [param, prefix],
  );

  return <div className={className}><Ctx.Provider value={{ active, setActive: change, prefix }}>{children}</Ctx.Provider></div>;
}

export type TabItem = { id: string; label: string; icon?: ReactNode; badge?: ReactNode };

export function TabsBar({ tabs, className }: { tabs: TabItem[]; className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <div role="tablist" className={cn("mb-6 flex gap-0.5 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t, index) => {
        const on = ctx.active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${ctx.prefix}-tab-${t.id}`}
            tabIndex={on ? 0 : -1}
            aria-selected={on}
            onClick={() => ctx.setActive(t.id)}
            onKeyDown={e => {
              const target=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
              if(target===null)return;e.preventDefault();ctx.setActive(tabs[target].id);document.getElementById(`${ctx.prefix}-tab-${tabs[target].id}`)?.focus();
            }}
            className={cn(
              "-mb-px flex min-h-11 items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/30",
              on ? "border-accent bg-accent/5 text-accent" : "border-transparent text-muted hover:border-border hover:bg-surface hover:text-foreground",
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
    <div role="tabpanel" aria-labelledby={`${ctx?.prefix}-tab-${id}`} data-tab-panel={id} data-tab-owner={ctx?.prefix} hidden={!on}
      onInvalidCapture={e => {
        if(on)return;
        const input=e.target as HTMLInputElement,first=input.form?.querySelector('input:invalid,select:invalid,textarea:invalid');
        if(first!==input)return;
        e.preventDefault();ctx?.setActive(id);requestAnimationFrame(()=>input.focus());
      }} className={cn(on ? "space-y-5" : "hidden", className)}>
      {children}
    </div>
  );
}
