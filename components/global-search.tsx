"use client";
import { useT } from "@/components/taal-provider";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** Globale zoekbalk — submit naar /search?q=… (top-bar + mobiele balk). */
export function GlobalSearch({ className }: { className?: string }) {
  const t = useT();
  return (
    <form action="/search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        name="q"
        placeholder={t("Zoeken… (contacten, offertes, facturen, producten)")}
        aria-label={t("Zoeken")}
        className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </form>
  );
}
