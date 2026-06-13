import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** Globale zoekbalk — submit naar /search?q=… (top-bar + mobiele balk). */
export function GlobalSearch({ className }: { className?: string }) {
  return (
    <form action="/search" className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        name="q"
        placeholder="Zoeken… (contacten, offertes, facturen, producten)"
        aria-label="Zoeken"
        className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
    </form>
  );
}
