"use client";

import { useCallback, useState } from "react";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button, Input, LinkButton, PageHeader } from "@/components/ui";
import { adjustStock, findProductByBarcode, type ScannedProduct } from "./actions";

export default function ScanPage() {
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const scanning = !product && !notFound;

  const lookup = useCallback(async (code: string) => {
    setBusy(true);
    setMsg(null);
    setNotFound(null);
    const p = await findProductByBarcode(code);
    if (p) setProduct(p);
    else setNotFound(code);
    setBusy(false);
  }, []);

  const onScan = useCallback(
    (code: string) => {
      if (!scanning || busy) return;
      lookup(code);
    },
    [scanning, busy, lookup],
  );

  function reset() {
    setProduct(null);
    setNotFound(null);
    setAmount("1");
    setManual("");
  }

  async function apply(mode: "in" | "out" | "set") {
    if (!product) return;
    setBusy(true);
    const res = await adjustStock(product.id, mode, Number(amount));
    setBusy(false);
    if (res.ok) {
      setMsg(`${product.name}: voorraad nu ${res.stockQty}`);
      reset();
    }
  }

  return (
    <>
      <PageHeader title="Scannen" subtitle="Scan een streepjescode om de voorraad bij te werken" />

      {msg && (
        <div className="mx-auto mb-4 max-w-md rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">
          ✓ {msg}
        </div>
      )}

      <div className="mx-auto max-w-md space-y-4">
        <BarcodeScanner onScan={onScan} paused={!scanning} />

        {scanning && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) lookup(manual.trim());
            }}
            className="flex gap-2"
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="…of typ een barcode / SKU"
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              Zoek
            </Button>
          </form>
        )}

        {notFound && (
          <div className="space-y-3 rounded-lg border p-4 text-sm">
            <p>
              Geen product met code <span className="font-mono">{notFound}</span>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={reset}>
                Opnieuw scannen
              </Button>
              <LinkButton href="/products" variant="ghost">
                Naar producten
              </LinkButton>
            </div>
          </div>
        )}

        {product && (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">{product.name}</p>
              {product.sku && <p className="font-mono text-xs text-muted">{product.sku}</p>}
              <p className="mt-1 text-sm">
                Huidige voorraad: <strong className="tabular-nums">{product.stockQty}</strong>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted">Aantal</label>
              <Input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => apply("in")} disabled={busy}>
                Erbij +
              </Button>
              <Button variant="secondary" onClick={() => apply("out")} disabled={busy}>
                Eraf −
              </Button>
              <Button variant="ghost" onClick={() => apply("set")} disabled={busy}>
                Zet op
              </Button>
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-md py-1.5 text-sm text-muted transition-colors hover:bg-muted/50"
            >
              Annuleren · volgende scannen
            </button>
          </div>
        )}
      </div>
    </>
  );
}
