"use client";

import { useEffect, useState } from "react";

import { Field, Input } from "@/components/ui";
import { landedCost, suggestedPrice } from "@/lib/pricing";
import { formatEUR } from "@/lib/utils";

type Vals = {
  purchaseCostEur: string;
  freightCostEur: string;
  transportCostEur: string;
  otherCostEur: string;
  dutyPct: string;
};

const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v);

export function CostBreakdown({
  initial,
}: {
  initial?: Partial<Record<keyof Vals | "targetMarginPct", string | number | null>>;
}) {
  const [v, setV] = useState<Vals>({
    purchaseCostEur: str(initial?.purchaseCostEur),
    freightCostEur: str(initial?.freightCostEur),
    transportCostEur: str(initial?.transportCostEur),
    otherCostEur: str(initial?.otherCostEur),
    dutyPct: str(initial?.dutyPct),
  });
  const set = (k: keyof Vals) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  // Live "actuele verkoopprijs" uit het hoofdveld in ProductForm — luisteren via DOM
  const [livePrice, setLivePrice] = useState<number>(0);
  useEffect(() => {
    const read = () => {
      const el = document.getElementById("priceEur") as HTMLInputElement | null;
      const n = Number(el?.value ?? 0);
      setLivePrice(Number.isFinite(n) ? n : 0);
    };
    read();
    const el = document.getElementById("priceEur") as HTMLInputElement | null;
    if (!el) return;
    el.addEventListener("input", read);
    el.addEventListener("change", read);
    return () => {
      el.removeEventListener("input", read);
      el.removeEventListener("change", read);
    };
  }, []);

  const cost = landedCost({
    purchaseCostEur: v.purchaseCostEur,
    freightCostEur: v.freightCostEur,
    transportCostEur: v.transportCostEur,
    otherCostEur: v.otherCostEur,
    dutyPct: v.dutyPct,
  });
  // Werkelijke marge = winst als % van verkoop = max. korting voor break-even
  const actualMarginPct = livePrice > 0 && cost > 0 ? ((livePrice - cost) / livePrice) * 100 : 0;
  const marginTone = actualMarginPct < 0 ? "red" : actualMarginPct < 20 ? "amber" : actualMarginPct < 40 ? "yellow" : "green";

  // Mini-calculator: gewenste marge → adviesprijs (niet opgeslagen)
  const [wantPct, setWantPct] = useState<string>("");
  const advice = wantPct ? suggestedPrice(cost, Number(wantPct) || 0) : 0;

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
      </div>

      {/* Hidden — bewaar oude targetMarginPct waarde uit DB onveranderd zodat 't
          niet weg-gestripped wordt bij update. Veld is niet meer zichtbaar. */}
      <input type="hidden" name="targetMarginPct" defaultValue={str(initial?.targetMarginPct)} />

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t pt-2 text-sm">
        <span>
          Landed cost (kostprijs):{" "}
          <span className="font-semibold tabular-nums">{formatEUR(cost)}</span>
        </span>
        {livePrice > 0 && cost > 0 && (
          <span
            className={
              marginTone === "red" ? "font-medium text-danger" :
              marginTone === "amber" ? "font-medium text-warning" :
              marginTone === "yellow" ? "text-foreground" :
              "font-medium text-success"
            }
          >
            Werkelijke marge:{" "}
            <span className="text-base tabular-nums">{actualMarginPct.toFixed(1)}%</span>
            <span className="ml-1 text-xs text-muted">(= max. korting voor break-even)</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-background/60 px-3 py-2 text-sm">
        <span className="text-xs text-muted">Rekenhulp:</span>
        <span className="text-xs">Bij</span>
        <input
          type="number"
          step="0.1"
          min="0"
          max="99"
          value={wantPct}
          onChange={(e) => setWantPct(e.target.value)}
          placeholder="50"
          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
        />
        <span className="text-xs">% marge → verkoopprijs zou</span>
        <span className="font-semibold tabular-nums">
          {wantPct && Number(wantPct) > 0 ? formatEUR(advice) : "—"}
        </span>
        <span className="text-xs text-muted">ex BTW</span>
        {wantPct && Number(wantPct) > 0 && advice > 0 && (
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("priceEur") as HTMLInputElement | null;
              if (el) {
                el.value = String(advice);
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.focus();
              }
            }}
            className="ml-1 rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            → Toepassen
          </button>
        )}
      </div>

      <p className="text-xs text-muted">
        De landed cost wordt opgeslagen als kostprijs. De werkelijke marge is live berekend uit
        verkoop- en kostprijs.
      </p>
    </div>
  );
}
