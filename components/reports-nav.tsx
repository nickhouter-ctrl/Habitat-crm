import Link from "next/link";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/rapporten", label: "Overzicht" },
  { href: "/rapporten/business", label: "Business" },
  { href: "/rapporten/inkoop-marge", label: "Inkoop & marge" },
  { href: "/rapporten/btw", label: "BTW" },
  { href: "/rapporten/analytics", label: "Analytics" },
  { href: "/rapporten/seo", label: "SEO" },
  { href: "/rapporten/data-check", label: "Data-check" },
];

/** Tabbalk over de rapporten-pagina's. `active` = het huidige pad. */
export function ReportsNav({ active }: { active: string }) {
  return (
    <div className="mb-6 flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const on = t.href === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors",
              on ? "border-accent text-accent" : "border-transparent text-muted hover:border-border hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
