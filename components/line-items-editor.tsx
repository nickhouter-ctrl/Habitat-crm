"use client";

import { AlertTriangle, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button, Input, Select } from "@/components/ui";
import type { ProductOption } from "@/app/(app)/_options";
import type { DocumentLineItem } from "@/lib/db/schema";
import { computeTotals, lineNet, lineUnitPrice } from "@/lib/documents";
import { LINE_CATEGORIES, vatForCategory } from "@/lib/products";
import { cn, formatEUR } from "@/lib/utils";

/** Below this margin a line is flagged amber; below 0 it's flagged red. */
const LOW_MARGIN_PCT = 15;

/** Rond een geldbedrag af op 2 decimalen (centen). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Bezorgtarief op basis van de enkele-reis afstand (km):
 * - €2,50/km tot 25 km, daarboven €1,80/km (oplopend/getrapt)
 * - enkele reis (roundTripFactor 1; zet op 2 voor heen + terug)
 * - starttarief €50 (minimum); pas als het km-bedrag hoger is, tellen de km
 */
const DELIVERY_PRICING = {
  baseFee: 50,
  ratePerKmUpTo25: 2.5,
  ratePerKmBeyond25: 1.8,
  tierKm: 25,
  roundTripFactor: 1,
};

function deliveryCostForKm(km: number): number {
  if (!(km > 0)) return 0;
  const oneWay =
    km <= DELIVERY_PRICING.tierKm
      ? km * DELIVERY_PRICING.ratePerKmUpTo25
      : DELIVERY_PRICING.tierKm * DELIVERY_PRICING.ratePerKmUpTo25 +
        (km - DELIVERY_PRICING.tierKm) * DELIVERY_PRICING.ratePerKmBeyond25;
  const trip = oneWay * DELIVERY_PRICING.roundTripFactor;
  return Math.max(DELIVERY_PRICING.baseFee, round2(trip));
}

type Row = {
  name: string;
  description: string;
  units: string;
  price: string;
  discount: string;
  taxRate: string;
  category: string;
  productId: string;
  phase: string;
};

function emptyRow(category = "materiaal"): Row {
  return {
    name: "",
    description: "",
    units: "1",
    price: "",
    discount: "0",
    taxRate: String(vatForCategory(category)),
    category,
    productId: "",
    phase: "",
  };
}

function rowToItem(r: Row): DocumentLineItem {
  return {
    name: r.name.trim(),
    description: r.description.trim() || undefined,
    units: Number(r.units) || 0,
    price: Number(r.price) || 0,
    discount: Number(r.discount) || 0,
    taxRate: Number(r.taxRate) || 0,
    category: r.category || undefined,
    productId: r.productId || undefined,
    phase: r.phase.trim() || undefined,
  };
}

/** Volgorde van de hoofdgroepen (collecties) in de product-pop-up. */
const COLLECTION_ORDER = [
  "Wandpanelen",
  "Badkamer",
  "Badkamer accessoires",
  "Binnen en buiten deuren",
  "Tuinmeubilair",
];

export function LineItemsEditor({
  name = "items",
  initialItems,
  products = [],
  onDistance,
  onSuggest,
  onDistanceCoords,
}: {
  name?: string;
  initialItems?: DocumentLineItem[] | null;
  products?: ProductOption[];
  /** Server-action: berekent km showroom → het ingevulde leveradres (tekst). */
  onDistance?: (address: string) => Promise<number | null>;
  /** Server-action: adres-suggesties (autocomplete). */
  onSuggest?: (query: string) => Promise<{ label: string; lng: number; lat: number }[]>;
  /** Server-action: km showroom → exacte coördinaten van een gekozen suggestie. */
  onDistanceCoords?: (lng: number, lat: number) => Promise<number | null>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialItems && initialItems.length > 0
      ? initialItems.map((it) => ({
          name: it.name,
          description: it.description ?? "",
          units: String(it.units),
          price: String(round2(Number(it.price) || 0)),
          discount: String(it.discount ?? 0),
          taxRate: String(it.taxRate ?? 21),
          category: it.category ?? "materiaal",
          productId: it.productId ?? "",
          phase: it.phase ?? "",
        }))
      : [emptyRow()],
  );

  // Klanttype bepaalt welke prijs we trekken uit de productcatalogus.
  // 'particulier' = showroom-prijs (priceEur); 'aannemer' = B2B (tradePriceEur,
  // valt terug op priceEur als die leeg is).
  const [audience, setAudience] = useState<"particulier" | "aannemer">("particulier");

  const totals = computeTotals(rows.map(rowToItem).filter((r) => r.name.length > 0));
  const costById = new Map(products.map((p) => [p.id, p.costEur != null ? Number(p.costEur) : null]));
  // Ook op SKU kunnen matchen (regels die wel een SKU in de omschrijving hebben
  // maar niet aan een productId gekoppeld zijn) — net als de factuurweergave.
  const costBySku = new Map(
    products
      .filter((p) => p.sku && p.costEur != null)
      .map((p) => [p.sku as string, Number(p.costEur)]),
  );
  /** Kostprijs van een regel: via productId, anders via SKU in de omschrijving. */
  const costOfRow = (r: Row): number | null => {
    const byId = r.productId ? costById.get(r.productId) : undefined;
    if (byId != null) return byId;
    const bySku = r.description ? costBySku.get(r.description.trim()) : undefined;
    return bySku ?? null;
  };

  const priceFor = (p: { priceEur: string | null; tradePriceEur: string | null }) =>
    audience === "aannemer" && p.tradePriceEur ? p.tradePriceEur : p.priceEur;

  // Productkeuze-scherm (pop-up): zoeken + filteren op collectie (hoofdgroep).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCol, setPickerCol] = useState("all");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const productCollections = Array.from(
    new Set(products.map((p) => p.collection?.trim() || "Overig")),
  ).sort((a, b) => {
    const ia = COLLECTION_ORDER.indexOf(a);
    const ib = COLLECTION_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  const pickerProducts = products.filter((p) => {
    const col = p.collection?.trim() || "Overig";
    if (pickerCol !== "all" && col !== pickerCol) return false;
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return `${p.name} ${p.sku ?? ""} ${p.category ?? ""} ${col}`.toLowerCase().includes(q);
  });
  // Binnen de resultaten groeperen op categorie (producten staan al op categorie gesorteerd).
  const pickerGroups: { cat: string; items: typeof pickerProducts }[] = [];
  for (const p of pickerProducts) {
    const cat = p.category?.trim() || "Overig";
    const last = pickerGroups[pickerGroups.length - 1];
    if (!last || last.cat !== cat) pickerGroups.push({ cat, items: [p] });
    else last.items.push(p);
  }
  const openPicker = () => {
    setAddedIds(new Set());
    setPickerQuery("");
    setPickerCol("all");
    setPickerOpen(true);
  };

  const patchRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const addFromProduct = (productId: string, sizeIndex?: number) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const size =
      sizeIndex != null ? (p.additionalSizes ?? [])[sizeIndex] : undefined;
    // Maat-prijs heeft voorrang; anders de productprijs.
    const basePrice = priceFor(p);
    const sizePrice =
      size && size.priceEur != null && size.priceEur !== undefined
        ? Number(size.priceEur)
        : basePrice
          ? Number(basePrice)
          : null;
    const row: Row = {
      name: size ? `${p.name} — ${size.label}` : p.name,
      description: size ? size.label : p.category ? p.category : "",
      units: "1",
      price: sizePrice != null ? String(round2(sizePrice)) : "",
      discount: "0",
      taxRate: String(p.vatRate ?? 21),
      category: "materiaal",
      productId: p.id,
      phase: "",
    };
    setRows((rs) =>
      rs.length === 1 && !rs[0].name.trim() && !rs[0].productId ? [row] : [...rs, row],
    );
  };

  // --- Bezorgkosten: afstand showroom → klantadres × tarief, als regel ---
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryKm, setDeliveryKm] = useState("");
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcMsg, setCalcMsg] = useState<string | null>(null);
  const deliveryFee = deliveryCostForKm(Number(deliveryKm) || 0);
  const [suggestions, setSuggestions] = useState<{ label: string; lng: number; lat: number }[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [anchorLabel, setAnchorLabel] = useState<string | null>(null);
  const suggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onAddressChange = (v: string) => {
    setDeliveryAddress(v);
    setCalcMsg(null);
    if (!v.trim()) {
      setSelectedCoords(null);
      setAnchorLabel(null);
    }
    if (suggTimer.current) clearTimeout(suggTimer.current);
    // Huisnummer aan het eind weglaten voor de zoekopdracht — ORS vindt straten/plaatsen
    // betrouwbaarder dan losse huisnummers.
    const q = v.replace(/[\s,]+\d+[a-z]?\s*$/i, "").trim();
    if (!onSuggest || q.length < 3) {
      setSuggestions([]);
      return;
    }
    suggTimer.current = setTimeout(async () => {
      const list = await onSuggest(q).catch(() => []);
      setSuggestions(list);
    }, 300);
  };

  // Een suggestie zet het afstand-ankerpunt (coördinaten). Je getypte adres
  // (mét huisnummer) blijft staan en komt op de offerte.
  const pickSuggestion = (s: { label: string; lng: number; lat: number }) => {
    setSelectedCoords({ lng: s.lng, lat: s.lat });
    setAnchorLabel(s.label);
    setSuggestions([]);
    setDeliveryAddress((cur) => (cur.trim() ? cur : s.label));
  };

  // Zet (of vervang) de bezorgregel op basis van een aantal km.
  const setDeliveryLine = (km: number) => {
    const fee = deliveryCostForKm(km);
    const line: Row = {
      name: km > 0 ? `Bezorgkosten (${km} km)` : "Bezorgkosten",
      description: deliveryAddress.trim() ? `Leveradres: ${deliveryAddress.trim()}` : "",
      units: "1",
      price: String(fee),
      discount: "0",
      taxRate: "21",
      category: "transport",
      productId: "",
      phase: "",
    };
    // Vervang een eventuele bestaande bezorgregel (geen dubbeltelling).
    setRows((rs) => [...rs.filter((r) => !r.name.startsWith("Bezorgkosten")), line]);
  };

  // Bereken de afstand uit het leveradres (indien ingevuld) en zet meteen de regel.
  const calcAndAdd = async () => {
    let km = Number(deliveryKm) || 0;
    const useCoords = selectedCoords && onDistanceCoords;
    const useText = !useCoords && onDistance && deliveryAddress.trim();
    if (useCoords || useText) {
      setCalcBusy(true);
      setCalcMsg(null);
      const got = useCoords
        ? await onDistanceCoords!(selectedCoords!.lng, selectedCoords!.lat).catch(() => null)
        : await onDistance!(deliveryAddress).catch(() => null);
      setCalcBusy(false);
      if (got != null) {
        km = got;
        setDeliveryKm(String(got));
      } else if (km <= 0) {
        setCalcMsg("Afstand niet gevonden — kies een adres uit de lijst of vul de km handmatig in.");
        return;
      }
    }
    if (km <= 0) {
      setCalcMsg("Vul een leveradres of de afstand (km) in.");
      return;
    }
    setCalcMsg(null);
    setDeliveryLine(km);
  };

  const setCategory = (i: number, category: string) => {
    patchRow(i, { category, taxRate: String(vatForCategory(category)) });
  };

  // Margin info for a row that's linked to a product with a known cost.
  // "marge" = winst als % van de verkoopprijs (zoals in de productcatalogus).
  const marginFor = (r: Row) => {
    const cost = costOfRow(r);
    if (cost == null || cost <= 0) return null;
    const unit = lineUnitPrice({ price: Number(r.price) || 0, discount: Number(r.discount) || 0 });
    const listPrice = Number(r.price) || 0;
    const pct = unit > 0 ? ((unit - cost) / unit) * 100 : -100;
    const breakEvenDiscount = listPrice > 0 ? Math.max(0, (1 - cost / listPrice) * 100) : 0;
    return { cost, pct, breakEvenDiscount };
  };

  const anyLoss = rows.some((r) => {
    const m = marginFor(r);
    return m != null && m.pct < 0;
  });

  // Totale (interne) marge over de regels met een bekende kostprijs.
  let marginRevenue = 0;
  let marginCost = 0;
  let costedCount = 0;
  let productLineCount = 0;
  for (const r of rows) {
    const isProductLine = !!r.productId || (r.description ? costBySku.has(r.description.trim()) : false);
    if (!isProductLine) continue;
    productLineCount++;
    const cost = costOfRow(r);
    if (cost == null || cost <= 0) continue;
    marginRevenue += lineNet(rowToItem(r));
    marginCost += cost * (Number(r.units) || 0);
    costedCount++;
  }
  const totalMargin = marginRevenue - marginCost;
  const totalMarginPct = marginRevenue > 0 ? (totalMargin / marginRevenue) * 100 : null;

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          rows.map((r) => ({
            name: r.name.trim(),
            description: r.description.trim(),
            units: Number(r.units),
            price: round2(Number(r.price) || 0),
            discount: Number(r.discount) || 0,
            taxRate: Number(r.taxRate),
            category: r.category,
            productId: r.productId,
            phase: r.phase.trim() || undefined,
          })),
        )}
      />
      <datalist id="doc-phase-suggestions">
        {Array.from(new Set(rows.map((r) => r.phase.trim()).filter(Boolean))).map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Regels</h3>
          <div className="flex items-center overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setAudience("particulier")}
              className={cn(
                "px-3 py-1.5",
                audience === "particulier" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft",
              )}
              title="Showroom-prijzen voor particulieren"
            >
              👤 Particulier
            </button>
            <button
              type="button"
              onClick={() => setAudience("aannemer")}
              className={cn(
                "border-l border-border px-3 py-1.5",
                audience === "aannemer" ? "bg-accent/15 font-medium text-accent" : "hover:bg-background-soft",
              )}
              title="Aannemers-/architectenprijs (~20% lager)"
            >
              🔨 Aannemer
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {products.length > 0 && (
            <Button type="button" size="sm" onClick={openPicker}>
              <Plus className="size-4" /> Product uit catalogus
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Lege regel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-1 py-1.5">Omschrijving</th>
              <th className="w-36 px-1 py-1.5">Categorie</th>
              <th className="w-16 px-1 py-1.5 text-right">Aantal</th>
              <th className="w-24 px-1 py-1.5 text-right">Prijs (ex.)</th>
              <th className="w-20 px-1 py-1.5 text-right">Korting%</th>
              <th className="w-20 px-1 py-1.5 text-right">BTW%</th>
              <th className="w-28 px-1 py-1.5 text-right">Netto</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => {
              const m = marginFor(r);
              const loss = m != null && m.pct < 0;
              const low = m != null && m.pct >= 0 && m.pct < LOW_MARGIN_PCT;
              const hasDiscount = (Number(r.discount) || 0) > 0;
              return (
                <tr key={i} className="align-top">
                  <td className="px-1 py-2">
                    <Input
                      value={r.name}
                      onChange={(e) => patchRow(i, { name: e.target.value, productId: "" })}
                      placeholder="Artikel of werkzaamheid"
                      className="mb-1"
                    />
                    <Input
                      value={r.description}
                      onChange={(e) => patchRow(i, { description: e.target.value })}
                      placeholder="Extra omschrijving (optioneel)"
                      className="text-xs"
                    />
                    <Input
                      value={r.phase}
                      onChange={(e) => patchRow(i, { phase: e.target.value })}
                      placeholder="Fase (optioneel, bv. 1 — Sloop)"
                      className="mt-1 text-xs"
                      list="doc-phase-suggestions"
                    />
                    {m != null && (
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-xs",
                          loss ? "font-medium text-danger" : low ? "text-warning" : "text-muted",
                        )}
                      >
                        {(loss || low) && <AlertTriangle className="size-3 shrink-0" />}
                        Kostprijs {formatEUR(m.cost)} · marge {m.pct.toFixed(0)}%
                        {loss && " — verlies!"}
                        {(loss || low) &&
                          ` · max. korting zonder verlies: ${m.breakEvenDiscount.toFixed(0)}%`}
                      </p>
                    )}
                  </td>
                  <td className="px-1 py-2">
                    <Select value={r.category} onChange={(e) => setCategory(i, e.target.value)}>
                      {LINE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label} ({c.vat}%)
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.units}
                      onChange={(e) => patchRow(i, { units: e.target.value })}
                      className="text-right"
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="number"
                      step="any"
                      title="Negatief bedrag mag — bijv. een aanbetaling/korting (reeds betaald −€1.000)"
                      value={r.price}
                      onChange={(e) => patchRow(i, { price: e.target.value })}
                      onBlur={(e) =>
                        patchRow(i, {
                          price:
                            e.target.value === ""
                              ? ""
                              : String(round2(Number(e.target.value) || 0)),
                        })
                      }
                      className="text-right"
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={r.discount}
                      onChange={(e) => patchRow(i, { discount: e.target.value })}
                      className={cn("text-right", (loss || low) && "border-warning")}
                    />
                  </td>
                  <td className="px-1 py-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={r.taxRate}
                      onChange={(e) => patchRow(i, { taxRate: e.target.value })}
                      className="text-right"
                    />
                  </td>
                  <td className="px-1 py-2 text-right tabular-nums">
                    {formatEUR(lineNet(rowToItem(r)))}
                    {hasDiscount && (
                      <span className="block text-xs text-muted line-through">
                        {formatEUR((Number(r.units) || 0) * (Number(r.price) || 0))}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="Regel verwijderen"
                      className={cn(
                        "rounded p-1 text-muted transition-colors hover:bg-background hover:text-danger",
                        rows.length <= 1 && "invisible",
                      )}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyLoss && (
        <p className="flex items-center gap-1.5 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          <AlertTriangle className="size-4" /> Eén of meer regels staan onder de kostprijs — controleer de korting.
        </p>
      )}

      {onDistance && (
        <div className="space-y-2.5 rounded-md border border-border bg-background-soft px-3 py-3">
          <p className="text-xs font-medium text-muted">🚚 Bezorgkosten</p>
          <div>
            <label htmlFor="leveradres" className="block text-[11px] text-muted">
              Leveradres — typ het volledige adres mét huisnummer; kies de juiste plaats uit de lijst
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="leveradres"
                  value={deliveryAddress}
                  onChange={(e) => onAddressChange(e.target.value)}
                  placeholder="bv. Avenida de Alicante 5, Jávea"
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-surface text-sm shadow-lg">
                    {suggestions.map((s, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                          className="block w-full px-3 py-2 text-left hover:bg-background"
                        >
                          {s.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Button type="button" size="sm" onClick={calcAndAdd} disabled={calcBusy}>
                {calcBusy ? "Berekenen…" : "Bereken & voeg toe"}
              </Button>
            </div>
            {anchorLabel && (
              <p className="text-[11px] text-success">
                📍 Afstand berekend t.o.v. <strong>{anchorLabel}</strong>{" "}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCoords(null);
                    setAnchorLabel(null);
                  }}
                  className="text-muted underline"
                >
                  wissen
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] text-muted">Afstand (km, enkele reis)</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={deliveryKm}
                onChange={(e) => setDeliveryKm(e.target.value)}
                className="w-28 text-right"
              />
            </div>
            <span className="mb-1 text-sm text-muted">
              Bezorgkosten: <strong className="text-foreground">{formatEUR(deliveryFee)}</strong>
              <span className="block text-[11px]">
                €2,50/km tot 25 km, daarna €1,80 · enkele reis · min. €50
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeliveryLine(Number(deliveryKm) || 0)}
              className="mb-0.5"
            >
              Bijwerken
            </Button>
          </div>
          {calcMsg && <p className="text-xs text-warning">{calcMsg}</p>}
        </div>
      )}

      <div className="ml-auto w-full max-w-xs space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Subtotaal</span>
          <span className="tabular-nums">{formatEUR(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">BTW</span>
          <span className="tabular-nums">{formatEUR(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span>Totaal</span>
          <span className="tabular-nums">{formatEUR(totals.total)}</span>
        </div>
        {costedCount > 0 && (
          <div
            className={cn(
              "mt-1 flex justify-between border-t pt-1 text-xs",
              totalMargin < 0
                ? "text-danger"
                : totalMarginPct != null && totalMarginPct < LOW_MARGIN_PCT
                  ? "text-warning"
                  : "text-muted",
            )}
            title="Interne brutomarge — niet zichtbaar voor de klant"
          >
            <span>Marge (intern){costedCount < productLineCount ? ` · ${costedCount}/${productLineCount} regels` : ""}</span>
            <span className="tabular-nums font-medium">
              {formatEUR(totalMargin)}
              {totalMarginPct != null ? ` · ${totalMarginPct.toFixed(0)}%` : ""}
            </span>
          </div>
        )}
      </div>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
          onClick={() => setPickerOpen(false)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 className="text-sm font-semibold">
                Product uit catalogus —{" "}
                <span className="text-muted">
                  {audience === "aannemer" ? "aannemersprijs" : "showroomprijs"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded p-1 text-muted hover:text-foreground"
                title="Sluiten"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
              <Input
                autoFocus
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Zoek op naam of SKU…"
                className="min-w-48 flex-1"
              />
              <Select value={pickerCol} onChange={(e) => setPickerCol(e.target.value)} className="w-56">
                {productCollections.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="all">Alle producten ({products.length})</option>
              </Select>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {pickerProducts.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted">Geen producten gevonden.</p>
              ) : (
                <ul>
                  {pickerGroups.map((g) => (
                    <li key={g.cat}>
                      <p className="sticky top-0 z-10 bg-background px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                        {g.cat}
                      </p>
                      <ul className="divide-y">
                        {g.items.map((p) => {
                          const price = priceFor(p);
                          const added = addedIds.has(p.id);
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  addFromProduct(p.id);
                                  setAddedIds((prev) => new Set(prev).add(p.id));
                                }}
                                className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-background"
                              >
                                <span className="min-w-0">
                                  <span className="font-medium">{p.name}</span>
                                  {p.sku && <span className="ml-2 text-xs text-muted">{p.sku}</span>}
                                </span>
                                <span className="flex shrink-0 items-center gap-3">
                                  <span className="tabular-nums">{price ? formatEUR(price) : "—"}</span>
                                  <span
                                    className={cn(
                                      "rounded px-2 py-0.5 text-xs font-medium",
                                      added ? "bg-success/15 text-success" : "bg-accent/10 text-accent",
                                    )}
                                  >
                                    {added ? "✓ toegevoegd" : "+ toevoegen"}
                                  </span>
                                </span>
                              </button>
                              {(p.additionalSizes ?? []).filter((s) => s.label).length > 0 && (
                                <ul className="border-t bg-background/40 pl-8">
                                  {(p.additionalSizes ?? []).map((s, si) =>
                                    s.label ? (
                                      <li key={s.sku || si}>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            addFromProduct(p.id, si);
                                            setAddedIds((prev) => new Set(prev).add(p.id));
                                          }}
                                          className="flex w-full items-center justify-between gap-3 px-5 py-1.5 text-left text-sm hover:bg-background"
                                        >
                                          <span className="flex items-center gap-2">
                                            {s.inStock ? (
                                              <span className="text-success" title="op voorraad">
                                                ●
                                              </span>
                                            ) : null}
                                            <span className="tabular-nums">{s.label.replace(/\*/g, "×")}</span>
                                            {s.sku ? (
                                              <span className="font-mono text-xs text-muted">{s.sku}</span>
                                            ) : null}
                                          </span>
                                          <span className="flex shrink-0 items-center gap-3 text-xs">
                                            <span className="tabular-nums">
                                              {s.priceEur != null ? formatEUR(s.priceEur) : "—"}
                                            </span>
                                            <span className="rounded bg-accent/10 px-2 py-0.5 font-medium text-accent">
                                              + maat
                                            </span>
                                          </span>
                                        </button>
                                      </li>
                                    ) : null,
                                  )}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between border-t px-5 py-3">
              <span className="text-xs text-muted">
                {addedIds.size > 0
                  ? `${addedIds.size} product${addedIds.size === 1 ? "" : "en"} toegevoegd`
                  : "Klik op een product om toe te voegen"}
              </span>
              <Button type="button" onClick={() => setPickerOpen(false)}>
                Klaar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
