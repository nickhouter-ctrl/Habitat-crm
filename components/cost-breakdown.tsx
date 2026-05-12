"use client";

import { useState } from "react";

import { Field, Input } from "@/components/ui";
import { landedCost, suggestedPrice } from "@/lib/pricing";
import { formatEUR } from "@/lib/utils";

type Vals = {
  purchaseCostEur: string;
  freightCostEur: string;
  transportCostEur: string;
  otherCostEur: string;
  dutyPct: string;
  targetMarginPct: string;
};

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

export function CostBreakdown({
  initial,
}: {
  initial?: Partial<Record<keyof Vals, string | number | null>>;
}) {
  const [v, setV] = useState<Vals>({
    purchaseCostEur: str(initial?.purchaseCostEur),
    freightCostEur: str(initial?.freightCostEur),
    transportCostEur: str(initial?.transportCostEur),
    otherCostEur: str(initial?.otherCostEur),
    dutyPct: str(initial?.dutyPct),
    targetMarginPct: str(initial?.targetMarginPct),
  });
  const set = (k: keyof Vals) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  const cost = landedCost({
    purchaseCostEur: v.purchaseCostEur,
    freightCostEur: v.freightCostEur,
    transportCostEur: v.transportCostEur,
    otherCostEur: v.otherCostEur,
    dutyPct: v.dutyPct,
  });
  const margin = Number(v.targetMarginPct) || 0;
  const advice = suggestedPrice(cost, margin);

  const moneyInput = (k: keyof Vals, label: string, hint?: string) => (
    <Field label={label} htmlFor={k} hint={hint}>
      <Input
        id={k}
        name={k}
        type="number"
        step="0.01"
        min="0"
        value={v[k]}
        onChange={set(k)}
        className="text-right"
      />
    </Field>
  );

  return (
    <div className="space-y-3 rounded-md border bg-background/50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        Kostprijs-opbouw (per eenheid)
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {moneyInput("purchaseCostEur", "Inkoop €", "bv. fabrieksprijs China")}
        {moneyInput("freightCostEur", "Vracht €", "China → Valencia")}
        {moneyInput("transportCostEur", "Transport €", "Valencia → Xàbia")}
        {moneyInput("otherCostEur", "Overig €", "verpakking, handling…")}
        <Field label="Invoerrechten %" htmlFor="dutyPct" hint="op inkoop + vracht">
          <Input
            id="dutyPct"
            name="dutyPct"
            type="number"
            step="0.01"
            min="0"
            value={v.dutyPct}
            onChange={set("dutyPct")}
            className="text-right"
          />
        </Field>
        <Field label="Gewenste marge %" htmlFor="targetMarginPct" hint="op verkoopprijs (= max. korting)">
          <Input
            id="targetMarginPct"
            name="targetMarginPct"
            type="number"
            step="0.01"
            min="0"
            max="99"
            value={v.targetMarginPct}
            onChange={set("targetMarginPct")}
            className="text-right"
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t pt-2 text-sm">
        <span>
          Landed cost (kostprijs):{" "}
          <span className="font-semibold tabular-nums">{formatEUR(cost)}</span>
        </span>
        {margin > 0 && cost > 0 && (
          <span className="text-muted">
            Adviesverkoopprijs bij {margin}% marge:{" "}
            <span className="font-semibold text-foreground tabular-nums">{formatEUR(advice)}</span>{" "}
            <span className="text-xs">(ex. BTW)</span>
          </span>
        )}
      </div>
      <p className="text-xs text-muted">
        De landed cost wordt opgeslagen als kostprijs van het product (zie de marge-kolom in het
        productenoverzicht). Laat velden leeg als je ze niet weet.
      </p>
    </div>
  );
}
