"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { moveDealToStage } from "@/app/(app)/deals/actions";
import { dealStageMeta, dealTypeMeta } from "@/app/(app)/_meta";
import { Badge } from "@/components/ui";
import { cn, formatEUR } from "@/lib/utils";

type StageKey = keyof typeof dealStageMeta;
type TypeKey = keyof typeof dealTypeMeta;

export type BoardDeal = {
  id: string;
  title: string;
  type: TypeKey;
  stage: StageKey;
  valueEur: string | null;
  probability: number;
  contactName: string | null;
};

const COLUMNS: StageKey[] = [
  "lead",
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "on_hold",
];

export function DealsBoard({ deals }: { deals: BoardDeal[] }) {
  const [items, setItems] = useState<BoardDeal[]>(deals);
  const [, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState<StageKey | null>(null);

  const move = (id: string, stage: StageKey) => {
    setItems((prev) =>
      prev.map((d) =>
        d.id === id
          ? {
              ...d,
              stage,
              probability: stage === "won" ? 100 : stage === "lost" ? 0 : d.probability,
            }
          : d,
      ),
    );
    startTransition(async () => {
      await moveDealToStage(id, stage);
    });
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {COLUMNS.map((stage) => {
          const colDeals = items.filter((d) => d.stage === stage);
          const total = colDeals.reduce((s, d) => s + Number(d.valueEur ?? 0), 0);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((p) => (p === stage ? null : p))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) move(id, stage);
              }}
              className={cn(
                "w-64 shrink-0 rounded-xl border bg-surface transition-shadow",
                dragOver === stage && "ring-2 ring-accent/40",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="flex items-center gap-2 text-sm">
                  <Badge tone={dealStageMeta[stage].tone}>{dealStageMeta[stage].label}</Badge>
                  <span className="text-muted">{colDeals.length}</span>
                </span>
                {total > 0 && (
                  <span className="text-xs tabular-nums text-muted">{formatEUR(total)}</span>
                )}
              </div>
              <div className="min-h-24 space-y-2 p-2">
                {colDeals.length === 0 && (
                  <p className="px-1 py-2 text-xs text-muted">—</p>
                )}
                {colDeals.map((d) => (
                  <div
                    key={d.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)}
                    className="cursor-grab rounded-lg border bg-background p-2.5 text-sm shadow-sm active:cursor-grabbing"
                  >
                    <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                      {d.title}
                    </Link>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                      <span className="truncate">{d.contactName ?? "—"}</span>
                      {d.valueEur && (
                        <span className="shrink-0 tabular-nums">{formatEUR(d.valueEur)}</span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-muted">
                      {dealTypeMeta[d.type]} · {d.probability}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
