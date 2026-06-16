"use client";

import { useCallback, useState } from "react";

import { BarcodeScanner } from "@/components/barcode-scanner";
import { Badge, Button, Input, LinkButton } from "@/components/ui";
import { formatEUR } from "@/lib/utils";
import { lookupProductInfo, type ProductInfo } from "./actions";

/** Opzoeken: scan een product en bekijk prijs, maten en voorraad (lees-alleen). */
export function ProductLookup() {
  const [info, setInfo] = useState<ProductInfo | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const scanning = !info && !notFound;

  const lookup = useCallback(async (code: string) => {
    setBusy(true);
    setNotFound(null);
    const p = await lookupProductInfo(code);
    if (p) setInfo(p);
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
    setInfo(null);
    setNotFound(null);
    setManual("");
  }

  const incl = (ex: number, vat: number) => ex * (1 + vat / 100);

  return (
    <div className="space-y-4">
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

      {info && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex gap-3">
            {info.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.imageUrl}
                alt={info.name}
                className="size-20 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{info.name}</p>
              {info.sku && <p className="font-mono text-xs text-muted">{info.sku}</p>}
              <p className="mt-0.5 text-xs text-muted">
                {[info.collection, info.category, info.subcategory].filter(Boolean).join(" · ") || "—"}
              </p>
              <div className="mt-1.5">
                <Badge tone={info.availability === "stock" ? "success" : "neutral"}>
                  {info.availability === "stock" ? "Op voorraad-artikel" : "Op bestelling"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Prijzen */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-background p-3">
              <p className="text-xs text-muted">Showroom (particulier)</p>
              <p className="text-lg font-semibold tabular-nums">
                {info.priceEur != null ? formatEUR(incl(info.priceEur, info.vatRate)) : "—"}
              </p>
              <p className="text-xs text-muted">
                {info.priceEur != null ? `${formatEUR(info.priceEur)} excl. · ` : ""}
                {info.vatRate}% btw{info.unit ? ` · per ${info.unit}` : ""}
              </p>
            </div>
            <div className="rounded-md bg-background p-3">
              <p className="text-xs text-muted">Zakelijk (B2B)</p>
              <p className="text-lg font-semibold tabular-nums">
                {info.tradePriceEur != null ? formatEUR(incl(info.tradePriceEur, info.vatRate)) : "—"}
              </p>
              <p className="text-xs text-muted">
                {info.tradePriceEur != null ? `${formatEUR(info.tradePriceEur)} excl.` : "geen B2B-prijs"}
              </p>
            </div>
          </div>

          {/* Afmetingen + voorraad */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            {info.dimensions && (
              <>
                <dt className="text-muted">Afmetingen</dt>
                <dd className="text-right tabular-nums">{info.dimensions}</dd>
              </>
            )}
            <dt className="text-muted">Voorraad</dt>
            <dd className="text-right tabular-nums">
              <span className={info.stockQty <= 0 ? "text-danger" : ""}>{info.stockQty}</span>
              {info.stockMin != null && <span className="text-muted"> / min {info.stockMin}</span>}
            </dd>
          </dl>

          {/* Extra maten */}
          {info.sizes.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                Beschikbare maten
              </p>
              <ul className="divide-y rounded-md border text-sm">
                {info.sizes.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{s.label}</span>
                      {s.sku && <span className="font-mono text-xs text-muted">{s.sku}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      {s.priceEur != null && (
                        <span className="block tabular-nums">{formatEUR(s.priceEur)}</span>
                      )}
                      <span className={`text-xs ${s.inStock ? "text-success" : "text-muted"}`}>
                        {s.inStock ? `voorraad ${s.stockQty ?? ""}`.trim() : "op bestelling"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {info.description && (
            <p className="whitespace-pre-wrap text-sm text-muted">{info.description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={reset}>
              Volgende scannen
            </Button>
            <LinkButton href={`/products/${info.id}`} variant="ghost">
              Open product →
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
