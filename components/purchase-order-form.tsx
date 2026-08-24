"use client";

import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Combobox, type ComboOption } from "@/components/combobox";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type {
  PurchaseOrder,
  PurchaseOrderAttachment,
  PurchaseOrderLineItem,
} from "@/lib/db/schema";
import { urenUitTarief } from "@/lib/labor-hours";
import { formatMoney, poLineTotal, PO_STATUS_META } from "@/lib/purchase-orders";
import { cn } from "@/lib/utils";

export type POProductOption = { id: string; name: string; sku: string | null };
/** Naam die je bij "Leverancier" kunt kiezen: een eerdere leverancier of iemand uit de ploeg. */
export type POSupplierOption = { name: string; hint?: string };
export type POProjectOption = { id: string; name: string };
export type POWorkerOption = { id: string; name: string; hourlyCostEur: number | null };

type Row = {
  productId: string;
  name: string;
  sku: string;
  units: string;
  unitPrice: string;
  note: string;
};

function toRow(it: Partial<PurchaseOrderLineItem>): Row {
  return {
    productId: it.productId ?? "",
    name: it.name ?? "",
    sku: it.sku ?? "",
    units: it.units != null ? String(it.units) : "1",
    unitPrice: it.unitPrice != null ? String(it.unitPrice) : "",
    note: it.note ?? "",
  };
}

function rowsToItems(rows: Row[]): PurchaseOrderLineItem[] {
  return rows
    .map((r) => ({
      name: r.name.trim(),
      sku: r.sku.trim() || undefined,
      productId: r.productId || undefined,
      units: Number(r.units) || 0,
      unitPrice: Number(r.unitPrice) || 0,
      note: r.note.trim() || undefined,
    }))
    .filter((r) => r.name.length > 0 || r.units !== 0);
}

const CURRENCIES = ["EUR", "USD", "GBP", "CNY"];

type ParseResult = {
  attachment: PurchaseOrderAttachment;
  parsed: {
    supplier?: string;
    reference?: string;
    orderDate?: string;
    expectedDate?: string;
    currency?: string;
    docKind?: "order" | "invoice";
    total?: number;
    subtotal?: number;
    items: (PurchaseOrderLineItem & { productId?: string })[];
  } | null;
  note?: string;
  error?: string;
};

export function PurchaseOrderForm({
  order,
  products,
  suppliers = [],
  projects = [],
  workers = [],
  action,
}: {
  order?: PurchaseOrder;
  products: POProductOption[];
  /** Bekende namen voor het leveranciersveld — vrij typen blijft gewoon werken. */
  suppliers?: POSupplierOption[];
  /** Werven om de factuur meteen op te boeken (alleen bij toevoegen). */
  projects?: POProjectOption[];
  /** De eigen ploeg, met hun uurtarief — daaruit volgen de uren. */
  workers?: POWorkerOption[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<"order" | "invoice">(
    (order?.kind as "order" | "invoice") ?? "order",
  );
  const [supplier, setSupplier] = useState(order?.supplier ?? "");
  const [reference, setReference] = useState(order?.reference ?? "");
  const [status, setStatus] = useState(order?.status ?? (order?.kind === "invoice" ? "received" : "ordered"));
  const [currency, setCurrency] = useState(order?.currency ?? "EUR");
  // Factuurmodus: bedragen die direct worden ingevuld (i.p.v. uit productregels).
  // Ook voorvullen bij kind="order": zo blijft het bedrag staan als je een uit
  // mail aangemaakte bestelling omzet naar factuurmodus om het subtotaal (ex.
  // btw) te corrigeren — anders zou het totaal op 0 komen.
  const [amountTotal, setAmountTotal] = useState(order?.total != null ? String(order.total) : "");
  const [amountSubtotal, setAmountSubtotal] = useState(
    order?.subtotal != null ? String(order.subtotal) : "",
  );
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? "");
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(
    order?.items?.length ? order.items.map(toRow) : [toRow({})],
  );
  const [attachments, setAttachments] = useState<PurchaseOrderAttachment[]>(
    order?.attachments ?? [],
  );
  // Meteen op een werf boeken. Alleen bij toevoegen: bij bewerken doet de
  // koppelkaart op de detailpagina dit al, en twee plekken die hetzelfde
  // beweren is vragen om verschil.
  const nieuw = !order;
  const [linkProjectId, setLinkProjectId] = useState("");
  const [linkKind, setLinkKind] = useState<"material" | "labor">("labor");
  const [linkWorkerId, setLinkWorkerId] = useState("");
  const [linkHours, setLinkHours] = useState("");
  const [urenZelfGetypt, setUrenZelfGetypt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const productOptions = useMemo<ComboOption[]>(
    () =>
      products.map((p) => ({
        value: p.id,
        label: p.sku ? `${p.name} · ${p.sku}` : p.name,
        hint: p.sku ?? undefined,
      })),
    [products],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const items = rowsToItems(rows);
  const total = items.reduce((s, it) => s + poLineTotal(it), 0);

  // Arbeidskost rekent ex. btw. Staat er een subtotaal, dan is dat het; anders
  // is het totaal het beste dat we hebben (bij btw verlegd is dat ook juist).
  const bedragExBtw = (() => {
    const n = (v: string) => Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    const sub = n(amountSubtotal);
    if (Number.isFinite(sub) && sub > 0) return sub;
    const tot = n(amountTotal);
    return Number.isFinite(tot) && tot > 0 ? tot : 0;
  })();
  const werkerTarief = Number(workers.find((w) => w.id === linkWorkerId)?.hourlyCostEur ?? 0);
  const berekendeUren = urenUitTarief(bedragExBtw, werkerTarief);

  function kiesWerker(id: string) {
    setLinkWorkerId(id);
    if (urenZelfGetypt) return;
    const berekend = urenUitTarief(bedragExBtw, workers.find((w) => w.id === id)?.hourlyCostEur);
    setLinkHours(berekend != null ? String(berekend) : "");
  }

  // Het bedrag komt vaak ná de arbeider binnen (de PDF wordt uitgelezen, of je
  // typt het totaal pas daarna). Dan moeten de uren mee veranderen — anders
  // staat er een getal dat bij een ouder bedrag hoorde.
  function herberekenUren(nieuwExBtw: number) {
    if (urenZelfGetypt || !linkWorkerId) return;
    const berekend = urenUitTarief(nieuwExBtw, werkerTarief);
    setLinkHours(berekend != null ? String(berekend) : "");
  }
  const alsBedrag = (v: string) =>
    Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function handleFile(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/inkooporders/parse", { method: "POST", body: fd });
      const data: ParseResult = await res.json();
      if (!res.ok || data.error) {
        setUploadMsg({ kind: "err", text: data.error ?? "Upload mislukt." });
        return;
      }
      setAttachments((a) => [...a, data.attachment]);
      if (data.parsed) {
        const p = data.parsed;
        if (p.supplier && !supplier) setSupplier(p.supplier);
        if (p.reference && !reference) setReference(p.reference);
        if (p.currency) setCurrency(p.currency);
        if (p.orderDate && !orderDate) setOrderDate(p.orderDate);
        if (p.expectedDate && !expectedDate) setExpectedDate(p.expectedDate);
        // Factuur/bon: schakel naar factuurmodus en vul het bedrag voor.
        if (p.docKind === "invoice") {
          setKind("invoice");
          if (status === "ordered") setStatus("received");
          if (p.total != null) setAmountTotal(String(p.total));
          if (p.subtotal != null) setAmountSubtotal(String(p.subtotal));
          // Uit de PDF gelezen bedrag telt net zo goed als een getypt bedrag:
          // staat er al een arbeider, dan volgen de uren daar nu uit.
          herberekenUren(p.subtotal ?? p.total ?? 0);
        }
        if (p.items.length) {
          setRows((rs) => {
            const existing = rowsToItems(rs);
            const fresh = p.items.map(toRow);
            // If the form only has the one empty starter row, replace it.
            return existing.length === 0 ? fresh : [...rs, ...fresh];
          });
        }
      }
      setUploadMsg({ kind: "ok", text: data.note ?? "Bestand toegevoegd." });
    } catch {
      setUploadMsg({ kind: "err", text: "Er ging iets mis bij het uploaden." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="items" value={JSON.stringify(kind === "invoice" ? [] : items)} />
      <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
      {kind === "invoice" && (
        <>
          <input type="hidden" name="amountTotal" value={amountTotal} />
          <input type="hidden" name="amountSubtotal" value={amountSubtotal} />
        </>
      )}

      {/* Type: bestelling (met productregels) of binnengekomen factuur/bon (bedrag) */}
      <div className="inline-flex rounded-lg border bg-surface/40 p-0.5 text-sm">
        {([
          ["order", "Bestelling"],
          ["invoice", "Factuur / bon"],
        ] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setKind(v);
              if (v === "invoice" && status === "ordered") setStatus("received");
            }}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              kind === v ? "bg-accent text-white shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "invoice" && (
        <p className="-mt-3 text-xs text-muted">
          Voor een binnengekomen factuur of bon (werknemer, materialen…): vul het bedrag in en hang de
          PDF eronder. Geen productregels of voorraad.
        </p>
      )}

      {/* Upload / auto-read */}
      <div className="rounded-lg border border-dashed bg-surface/50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {uploading ? "Bezig met uitlezen…" : "Document uploaden (PDF)"}
          </Button>
          <span className="text-xs text-muted">
            Proforma, factuur of bon. De PDF wordt automatisch uitgelezen (leverancier, bedrag,
            {kind === "order" ? " regels, aantallen" : " datum"}). Excel/afbeelding wordt alleen als
            bijlage bewaard.
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
        {uploadMsg && (
          <p className={cn("mt-2 text-xs", uploadMsg.kind === "ok" ? "text-accent" : "text-danger")}>
            {uploadMsg.text}
          </p>
        )}
        {attachments.length > 0 && (
          <ul className="mt-3 space-y-1">
            {attachments.map((a, i) => (
              <li
                key={a.path}
                className="flex items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted" />
                <span className="flex-1 truncate">{a.name}</span>
                {a.size != null && (
                  <span className="text-xs text-muted">{Math.round(a.size / 1024)} kB</span>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((arr) => arr.filter((_, idx) => idx !== i))}
                  className="text-muted hover:text-danger"
                  aria-label="Bijlage verwijderen"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Leverancier"
          htmlFor="supplier"
          hint={suppliers.length ? "kies uit de lijst of typ een nieuwe naam" : undefined}
        >
          {/* Bewust een datalist en geen keuzelijst: een leverancier kan ook
              iemand zijn die er nog niet in staat, en het veld wordt door het
              uitlezen van de PDF ingevuld. Zo houd je vrij typen én krijg je de
              ploeg en eerdere leveranciers als suggestie — met de exacte
              schrijfwijze, want dáárop worden uren aan een arbeider gekoppeld. */}
          <Input
            id="supplier"
            name="supplier"
            required
            list="po-suppliers"
            autoComplete="off"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="KingKonree International (H.K) Limited"
          />
          <datalist id="po-suppliers">
            {suppliers.map((s) => (
              <option key={s.name} value={s.name}>
                {s.hint}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Referentie / PI-nummer" htmlFor="reference">
          <Input
            id="reference"
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="33#kkr20251126xm"
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as PurchaseOrder["status"])}>
            {Object.entries(PO_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valuta" htmlFor="currency">
          <Select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set([currency, ...CURRENCIES])].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Besteldatum" htmlFor="orderDate">
          <Input
            id="orderDate"
            name="orderDate"
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
          />
        </Field>
        <Field label="Verwacht binnen" htmlFor="expectedDate">
          <Input
            id="expectedDate"
            name="expectedDate"
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </Field>
      </div>

      {kind === "invoice" ? (
        <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Bedrag totaal (incl. btw, ${currency})`} htmlFor="amountTotal">
            <Input
              id="amountTotal"
              inputMode="decimal"
              value={amountTotal}
              onChange={(e) => {
                setAmountTotal(e.target.value);
                // Zonder subtotaal is het totaal het bedrag waar we mee rekenen.
                if (!amountSubtotal.trim()) herberekenUren(alsBedrag(e.target.value));
              }}
              placeholder="1.210,00"
              className="text-right"
            />
          </Field>
          <Field label={`Subtotaal (ex. btw, ${currency})`} htmlFor="amountSubtotal" hint="leeg = gelijk aan totaal (bv. btw verlegd)">
            <Input
              id="amountSubtotal"
              inputMode="decimal"
              value={amountSubtotal}
              onChange={(e) => {
                setAmountSubtotal(e.target.value);
                herberekenUren(alsBedrag(e.target.value) || alsBedrag(amountTotal));
              }}
              placeholder="1.000,00"
              className="text-right"
            />
          </Field>
        </div>

        {nieuw && projects.length > 0 && (
          <div className="space-y-3 rounded-lg border bg-background/50 p-4">
            <div>
              <span className="text-sm font-semibold">Bij welke werf hoort dit? </span>
              <span className="text-xs text-muted">optioneel — kan ook later</span>
            </div>
            <Combobox
              name="linkProjectId"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              defaultValue=""
              clearable
              placeholder="Zoek een werf…"
              menuClassName="w-full"
              onSelect={(v) => setLinkProjectId(v)}
            />

            {linkProjectId && (
              <>
                <input type="hidden" name="linkKind" value={linkKind} />
                <div className="flex flex-wrap gap-2 text-sm">
                  {(
                    [
                      ["labor", "Uren / arbeid"],
                      ["material", "Materiaal"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLinkKind(v)}
                      aria-pressed={linkKind === v}
                      className={cn(
                        "rounded-md border px-3 py-1.5 font-medium transition-colors",
                        linkKind === v ? "border-accent bg-accent/10 text-accent" : "bg-surface text-muted hover:text-ink",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {linkKind === "labor" && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium">Wie heeft deze uren gemaakt?</label>
                      <Combobox
                        name="linkWorkerId"
                        options={workers.map((w) => ({
                          value: w.id,
                          label: w.name,
                          hint: w.hourlyCostEur ? `€ ${w.hourlyCostEur}/u` : undefined,
                        }))}
                        defaultValue=""
                        clearable
                        placeholder="Zoek in de ploeg…"
                        menuClassName="w-full"
                        onSelect={(v) => kiesWerker(v)}
                      />
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-32">
                        <label className="mb-1.5 block text-sm font-medium" htmlFor="linkHours">
                          Aantal uren
                        </label>
                        <Input
                          id="linkHours"
                          name="linkHours"
                          inputMode="decimal"
                          className="text-right"
                          value={linkHours}
                          onChange={(e) => {
                            setLinkHours(e.target.value);
                            setUrenZelfGetypt(true);
                          }}
                          placeholder="bijv. 94,5"
                        />
                      </div>
                      <p className="flex-1 text-xs text-muted">
                        {berekendeUren != null && !urenZelfGetypt && linkHours === String(berekendeUren)
                          ? `Berekend: € ${bedragExBtw.toFixed(2)} ex btw ÷ € ${werkerTarief}/u van zijn ploegkaart. Noemt de factuur andere uren, typ ze er dan overheen.`
                          : linkWorkerId && werkerTarief <= 0
                            ? "Op zijn ploegkaart staat geen uurtarief. Vul de uren zelf in, anders komt het hele bedrag als één post van 1 uur op de werf."
                            : "Kies eerst het bedrag en de arbeider; de uren volgen dan uit zijn tarief."}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </>
      ) : (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Regels</h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, toRow({})])}>
            <Plus className="size-4" /> Regel
          </Button>
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => {
            const lineTotal = (Number(r.units) || 0) * (Number(r.unitPrice) || 0);
            return (
              <div
                key={i}
                className="grid items-start gap-2 rounded-md border bg-surface/40 p-2 sm:grid-cols-[1fr_1fr_5rem_7rem_2.25rem]"
              >
                <div className="space-y-1">
                  <Combobox
                    options={productOptions}
                    defaultValue={r.productId}
                    placeholder="Koppel product (optioneel)…"
                    clearable
                    emptyText="Geen product"
                    onSelect={(v) => {
                      const p = v ? productById.get(v) : undefined;
                      update(i, {
                        productId: v ?? "",
                        ...(p ? { name: r.name || p.name, sku: r.sku || (p.sku ?? "") } : {}),
                      });
                    }}
                  />
                  <Input
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Omschrijving"
                  />
                </div>
                <div className="space-y-1">
                  <Input value={r.sku} onChange={(e) => update(i, { sku: e.target.value })} placeholder="SKU" />
                  <Input
                    value={r.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    placeholder="Notitie (kleur, maat…)"
                  />
                </div>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={r.units}
                  onChange={(e) => update(i, { units: e.target.value })}
                  placeholder="Aantal"
                  className="text-right"
                />
                <div className="space-y-1">
                  <Input
                    type="number"
                    step="any"
                    value={r.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                    placeholder="Stukprijs"
                    className="text-right"
                  />
                  <div className="px-1 text-right text-xs text-muted tabular-nums">
                    {formatMoney(lineTotal, currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                  className="mt-0.5 flex size-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  aria-label="Regel verwijderen"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex justify-end text-sm">
          <span className="text-muted">Totaal:&nbsp;</span>
          <span className="font-semibold tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>
      )}

      <Field label="Notities" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Levertijd, aanbetaling, opmerkingen…"
        />
      </Field>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Opslaan…">
          {order ? "Opslaan" : kind === "invoice" ? "Factuur toevoegen" : "Bestelling aanmaken"}
        </SubmitButton>
      </div>
    </form>
  );
}
