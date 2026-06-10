"use client";

import { useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";

import { buttonClass, Input } from "@/components/ui";
import { addToOrder, searchOrderable } from "./actions";

type Prod = { id: string; name: string; sku: string | null; collection: string | null };
type Var = {
  id: string;
  sku: string;
  legacySku: string | null;
  color: string;
  productName: string | null;
  collectionName: string | null;
};

export function OrderSearch({ suppliers }: { suppliers: string[] }) {
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<{ products: Prod[]; variants: Var[] }>({
    products: [],
    variants: [],
  });
  const [pending, start] = useTransition();

  function run(q: string) {
    setTerm(q);
    if (q.trim().length < 2) {
      setRes({ products: [], variants: [] });
      return;
    }
    start(async () => setRes(await searchOrderable(q)));
  }

  const empty = res.products.length === 0 && res.variants.length === 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          value={term}
          onChange={(e) => run(e.target.value)}
          placeholder="Zoek product of catalogus-SKU om toe te voegen…"
          className="pl-9"
        />
      </div>

      {pending && <p className="text-xs text-muted">Zoeken…</p>}

      {!empty && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {res.variants.map((v) => (
            <AddRow
              key={`v-${v.id}`}
              kind="catalog"
              refId={v.id}
              title={`${v.productName} — ${v.color}`}
              subtitle={`${v.collectionName ?? ""} · ${v.legacySku ?? v.sku}`}
              tag="Catalogus"
              defaultSupplier="Magic Stone"
              suppliers={suppliers}
            />
          ))}
          {res.products.map((p) => (
            <AddRow
              key={`p-${p.id}`}
              kind="product"
              refId={p.id}
              title={p.name}
              subtitle={[p.collection, p.sku].filter(Boolean).join(" · ")}
              tag="Product"
              defaultSupplier=""
              suppliers={suppliers}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddRow({
  kind,
  refId,
  title,
  subtitle,
  tag,
  defaultSupplier,
  suppliers,
}: {
  kind: "catalog" | "product";
  refId: string;
  title: string;
  subtitle: string;
  tag: string;
  defaultSupplier: string;
  suppliers: string[];
}) {
  return (
    <form action={addToOrder} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="refId" value={refId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted">
          <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">{tag}</span>
          {subtitle}
        </p>
      </div>
      <input
        name="supplierName"
        defaultValue={defaultSupplier}
        list="supplier-list"
        placeholder="Leverancier"
        className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm"
      />
      <datalist id="supplier-list">
        {suppliers.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <input
        name="qty"
        type="number"
        min={1}
        step="any"
        defaultValue={1}
        className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm"
      />
      <select
        name="unit"
        defaultValue="stuk"
        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="stuk">stuk</option>
        <option value="doos">doos</option>
        <option value="m2">m²</option>
      </select>
      <button type="submit" className={buttonClass({ size: "sm" })}>
        <Plus className="h-4 w-4" />
      </button>
    </form>
  );
}
