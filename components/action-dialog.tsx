"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "./taal-provider";
import { cn } from "@/lib/utils";

/** Extra choices open only when needed; native dialog handles focus and Escape. */
export function ActionDialog({ title, trigger, children, className, wide = false }: {
  title: string; trigger?: ReactNode; children: ReactNode; className?: string; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null), id = useId(), t = useT();
  return <>
    <button type="button" aria-haspopup="dialog" aria-controls={id} onClick={() => ref.current?.showModal()}
      className={cn("inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border bg-surface px-3.5 py-2 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", className)}>
      {trigger ?? title}
    </button>
    <dialog id={id} ref={ref} aria-labelledby={`${id}-title`}
      className={cn("m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/45", wide ? "max-w-5xl" : "max-w-xl")}
      onClick={e => {
        // In-page links must reveal the destination instead of leaving it behind the modal.
        if ((e.target as Element).closest("a[href]")) ref.current?.close();
        if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) ref.current?.close(); }
      }}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-surface px-5 py-4">
        <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">{title}</h2>
        <button type="button" aria-label={t("Sluiten")} onClick={() => ref.current?.close()} className="rounded-lg p-2 text-muted hover:bg-background"><X size={18}/></button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  </>;
}
