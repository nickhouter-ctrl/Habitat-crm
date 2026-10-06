"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useT } from "./taal-provider";

export type FinancialSection = { title: string; columns: string[]; rows: { cells: string[]; href?: string }[]; note?: string };
export type FinancialDetail = { title: string; formula: string; sections: FinancialSection[] };
const Context = createContext<((key: string) => void) | null>(null);

export function FinancialTable({ section }: { section: FinancialSection }) {
  return <section className="mt-5 min-w-0"><h3 className="mb-2 text-sm font-semibold">{section.title}</h3>
    {section.note && <p className="mb-3 text-xs text-muted">{section.note}</p>}
    <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm">
      <thead className="bg-background text-xs text-muted"><tr>{section.columns.map((c,i) => <th key={i} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
      <tbody>{section.rows.map((row,i) => <tr className="border-t" key={i}>{row.cells.map((cell,j) => <td key={j} className="px-3 py-2 align-top tabular-nums">{j === 0 && row.href ? <Link href={row.href} className="text-accent underline underline-offset-2">{cell}</Link> : cell}</td>)}</tr>)}</tbody>
    </table></div>
  </section>;
}

/** One shared modal avoids duplicating every source table behind every card. */
export function FinancialDetailsProvider({ details, children }: { details: Record<string, FinancialDetail>; children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null), ref = useRef<HTMLDialogElement>(null), t = useT();
  const current = key ? details[key] : null;
  return <Context.Provider value={key => { setKey(key); ref.current?.showModal(); }}>
    {children}
    <dialog ref={ref} aria-labelledby="financial-details-title" data-financial-details className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-y-auto rounded-2xl border bg-surface p-0 text-foreground shadow-xl backdrop:bg-black/45"
      onClick={event => { if ((event.target as Element).closest("a[href]")) ref.current?.close(); }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-surface px-5 py-4">
        <h2 id="financial-details-title" className="font-semibold">{current?.title}</h2>
        <button type="button" onClick={() => ref.current?.close()} className="rounded-lg border px-3 py-2 text-sm">{t("Sluiten")}</button>
      </div>
      {current && <div className="p-5"><p className="rounded-lg bg-background p-3 text-sm font-medium tabular-nums">{current.formula}</p>{current.sections.map((section,i) => <FinancialTable key={i} section={section}/>)}</div>}
    </dialog>
  </Context.Provider>;
}

/** Card contents remain semantic HTML. The separate button covers the card. */
export function FinancialInspect({ detail, label, className = "", children }: { detail: string; label: string; className?: string; children: ReactNode }) {
  const open = useContext(Context), t = useT();
  return <div className={`relative min-w-0 ${className}`}>
    {children}
    {open && <button type="button" data-financial-open={detail} aria-label={`${label} — ${t("Berekening en bronnen")}`} aria-haspopup="dialog"
      onClick={() => open(detail)} className="absolute inset-0 rounded-lg text-left transition-shadow hover:ring-1 hover:ring-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"/>}
  </div>;
}
