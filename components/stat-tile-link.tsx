"use client";

import { useT } from "@/components/taal-provider";

/** Shared primitives remain server-renderable; only this accessible label needs context. */
export function StatTileLink({ href, label }: { href: string; label: string }) {
  const t = useT();
  return (
    <a href={href} className="after:absolute after:inset-0" aria-label={t("Bekijk onderbouwing: {label}", { label })}>
      {label}
    </a>
  );
}
