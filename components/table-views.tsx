"use client";

import { useId, useState, type ReactNode } from "react";
import { useT } from "./taal-provider";

export type TableView = { id: string; label: string; hidden: number[] };

/** The same rows and actions remain mounted; only optional columns change. */
export function TableViews({ views, children }: { views: TableView[]; children: ReactNode }) {
  const t = useT(), scope = useId().replace(/[^a-zA-Z0-9_-]/g, ""), [selected, setSelected] = useState(views[0]?.id);
  const hidden = views.find(view => view.id === selected)?.hidden ?? [];
  const selectors = hidden.filter(index => Number.isInteger(index) && index > 0 && index <= 64)
    .flatMap(index => [`[data-table-scope="${scope}"] table > thead > tr > :nth-child(${index})`, `[data-table-scope="${scope}"] table > tbody > tr > :nth-child(${index})`]);
  return <div data-table-scope={scope}>
    <div aria-label={t("Weergave")} className="flex flex-wrap gap-1 border-b px-4 py-2 print:hidden">{views.map(view => <button type="button" key={view.id} aria-pressed={selected === view.id} onClick={() => setSelected(view.id)} className={`rounded-lg px-3 py-2 text-xs font-medium ${selected === view.id ? "bg-accent/10 text-accent" : "text-muted hover:bg-background"}`}>{view.label}</button>)}</div>
    {selectors.length > 0 && <style>{`@media screen {${selectors.join(",")} {display:none}}`}</style>}
    {children}
  </div>;
}
