"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Wand2, X } from "lucide-react";

type Waarde = { value: string; label: string; imageUrl?: string | null };
type As = { key: string; label: string; values: Waarde[] };

type Rij = {
  id?: string;
  code: string;
  options: Record<string, string>;
  priceEur: number | null;
  discountPct: number | null;
  purchaseCostEur: number | null;
  imageUrl: string;
  isActive: boolean;
};

const cell = "h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm";
const num = `${cell} text-right tabular-nums`;
const numOrNull = (v: string) => (v === "" ? null : Number(v));
const sleutelVan = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "") || "as";

/**
 * Uitvoeringen van één product: kleur, model, maat.
 *
 * Boven de keuzes met hun waarden, daaronder één regel per verkoopbaar artikel.
 * "Combinaties voorstellen" vult de ontbrekende kruisingen aan — je houdt ze
 * niet allemaal, want niet elke combinatie bestaat echt (Brauer verkoopt niet
 * elke hendel in elke kleur). Een regel telt pas mee zodra er een artikelcode
 * op staat.
 *
 * Serialiseert naar twee hidden inputs voor `saveVariants`.
 */
export function VariantMatrixEditor({
  axes,
  variants,
  dealerDiscountPct,
}: {
  axes?: As[] | null;
  variants?: Rij[] | null;
  dealerDiscountPct?: number | null;
}) {
  const [assen, setAssen] = useState<As[]>(axes ?? []);
  const [rijen, setRijen] = useState<Rij[]>(variants ?? []);
  const [nieuweWaarde, setNieuweWaarde] = useState<Record<string, string>>({});
  const [nieuweAs, setNieuweAs] = useState("");
  const [bulkPrijs, setBulkPrijs] = useState<Record<string, string>>({});

  const labelVan = (rij: Rij) =>
    assen
      .map((a) => {
        const gekozen = rij.options[a.key];
        return gekozen ? (a.values.find((v) => v.value === gekozen)?.label ?? gekozen) : null;
      })
      .filter(Boolean)
      .join(" · ");

  const wijzig = (i: number, patch: Partial<Rij>) =>
    setRijen((r) => r.map((rij, j) => (j === i ? { ...rij, ...patch } : rij)));

  const asToevoegen = () => {
    const naam = nieuweAs.trim();
    if (!naam) return;
    const key = sleutelVan(naam);
    if (!assen.some((a) => a.key === key)) setAssen((a) => [...a, { key, label: naam, values: [] }]);
    setNieuweAs("");
  };

  /** Het kleine plaatje bij één keuzewaarde — de staal of het tekeningetje. */
  const fotoZetten = (asKey: string, waarde: string, url: string) =>
    setAssen((a) =>
      a.map((x) =>
        x.key === asKey
          ? { ...x, values: x.values.map((v) => (v.value === waarde ? { ...v, imageUrl: url || null } : v)) }
          : x,
      ),
    );

  const waardeToevoegen = (key: string) => {
    const tekst = (nieuweWaarde[key] ?? "").trim();
    if (!tekst) return;
    setAssen((a) =>
      a.map((as) =>
        as.key === key && !as.values.some((v) => v.label === tekst)
          ? {
              ...as,
              values: [...as.values, { value: sleutelVan(tekst).toUpperCase().slice(0, 12), label: tekst }],
            }
          : as,
      ),
    );
    setNieuweWaarde((n) => ({ ...n, [key]: "" }));
  };

  /** Alle kruisingen die er nog niet zijn, als lege regels erbij. */
  const voorstellen = () => {
    const bruikbaar = assen.filter((a) => a.values.length > 0);
    if (!bruikbaar.length) return;
    const combos = bruikbaar.reduce<Array<Record<string, string>>>(
      (acc, as) => acc.flatMap((rij) => as.values.map((v) => ({ ...rij, [as.key]: v.value }))),
      [{}],
    );
    const sleutel = (o: Record<string, string>) => bruikbaar.map((a) => o[a.key] ?? "").join("|");
    const bestaat = new Set(rijen.map((r) => sleutel(r.options)));
    const nieuw = combos
      .filter((c) => !bestaat.has(sleutel(c)))
      .map<Rij>((options) => ({
        code: "",
        options,
        priceEur: null,
        discountPct: dealerDiscountPct ?? null,
        purchaseCostEur: null,
        imageUrl: "",
        isActive: true,
      }));
    setRijen((r) => [...r, ...nieuw]);
  };

  /**
   * Eén prijs voor alle regels met dezelfde waarde op de eerste keuze. Chroom is
   * bij Brauer een stuk goedkoper dan goud, maar bínnen een kleur is de prijs
   * meestal gelijk — dit scheelt tientallen keren hetzelfde bedrag typen.
   */
  const prijsToepassen = (asKey: string, waarde: string) => {
    const ruw = (bulkPrijs[`${asKey}:${waarde}`] ?? "").replace(",", ".").trim();
    if (!ruw) return;
    const bedrag = Number(ruw);
    if (!Number.isFinite(bedrag) || bedrag < 0) return;
    setRijen((r) => r.map((rij) => (rij.options[asKey] === waarde ? { ...rij, priceEur: bedrag } : rij)));
  };

  const meeTeSturen = useMemo(
    () => rijen.filter((r) => r.code.trim() !== "").map((r) => ({ ...r, code: r.code.trim() })),
    [rijen],
  );

  // Inline stijl in plaats van een Tailwind-klasse: het aantal kolommen hangt
  // van de assen af, en die kan Tailwind niet vooraf uitrekenen.
  const raster: React.CSSProperties = {
    display: "grid",
    alignItems: "center",
    gap: "0.5rem",
    minWidth: "860px",
    gridTemplateColumns: `minmax(150px,1.3fr) ${assen
      .map(() => "minmax(110px,1fr)")
      .join(" ")} 1fr 0.8fr 1fr minmax(120px,1.2fr) auto`,
  };

  const eersteAs = assen.find((a) => a.values.length > 0);

  return (
    <div className="space-y-4">
      <input type="hidden" name="optionAxes" value={JSON.stringify(assen)} />
      <input type="hidden" name="variants" value={JSON.stringify(meeTeSturen)} />

      {/* ---------- de keuzes ---------- */}
      <div className="space-y-2">
        {assen.map((as) => (
          <div key={as.key} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{as.label}</span>
              <button
                type="button"
                onClick={() => setAssen((a) => a.filter((x) => x.key !== as.key))}
                className="text-xs text-muted underline underline-offset-2 hover:text-danger"
              >
                keuze weghalen
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-start gap-2">
              {as.values.map((v) => (
                <span
                  key={v.value}
                  className="inline-flex flex-col gap-1 rounded-md border border-border p-1.5 text-xs"
                >
                  <span className="flex items-center gap-1">
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.imageUrl} alt="" className="size-6 rounded border object-cover" />
                    ) : (
                      <span className="flex size-6 items-center justify-center rounded border border-dashed text-[8px] text-muted">
                        geen
                      </span>
                    )}
                    {v.label}
                    <button
                      type="button"
                      onClick={() =>
                        setAssen((a) =>
                          a.map((x) =>
                            x.key === as.key ? { ...x, values: x.values.filter((y) => y.value !== v.value) } : x,
                          ),
                        )
                      }
                      className="text-muted hover:text-danger"
                      title={`${v.label} weghalen`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                  <input
                    value={v.imageUrl ?? ""}
                    onChange={(e) => fotoZetten(as.key, v.value, e.target.value)}
                    placeholder="foto-URL"
                    className="h-6 w-36 rounded border border-border bg-background px-1.5 text-[11px]"
                  />
                </span>
              ))}
              <input
                value={nieuweWaarde[as.key] ?? ""}
                onChange={(e) => setNieuweWaarde((n) => ({ ...n, [as.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    waardeToevoegen(as.key);
                  }
                }}
                placeholder="waarde + enter"
                className="h-7 w-40 rounded-md border border-dashed border-border bg-background px-2 text-xs"
              />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nieuweAs}
            onChange={(e) => setNieuweAs(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                asToevoegen();
              }
            }}
            placeholder="Kleur, Model, Maat…"
            className="h-8 w-44 rounded-md border border-dashed border-border bg-background px-2 text-xs"
          />
          <button
            type="button"
            onClick={asToevoegen}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted hover:bg-muted/40"
          >
            <Plus className="size-3.5" /> Keuze toevoegen
          </button>
          {assen.some((a) => a.values.length > 0) && (
            <button
              type="button"
              onClick={voorstellen}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-muted/40"
            >
              <Wand2 className="size-3.5" /> Combinaties voorstellen
            </button>
          )}
        </div>
      </div>

      {/* ---------- prijs per waarde van de eerste keuze ---------- */}
      {eersteAs && rijen.length > 0 && (
        <div className="rounded-lg border border-border p-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Prijs per {eersteAs.label.toLowerCase()}
          </span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {eersteAs.values.map((v) => (
              <div key={v.value} className="flex items-center gap-1">
                <span className="text-xs text-muted">{v.label}</span>
                <input
                  value={bulkPrijs[`${eersteAs.key}:${v.value}`] ?? ""}
                  onChange={(e) =>
                    setBulkPrijs((b) => ({ ...b, [`${eersteAs.key}:${v.value}`]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      prijsToepassen(eersteAs.key, v.value);
                    }
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="h-7 w-24 rounded-md border border-border bg-background px-2 text-right text-xs tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => prijsToepassen(eersteAs.key, v.value)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] text-muted hover:bg-muted/40"
                >
                  vul in
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------- de uitvoeringen ---------- */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div
          style={raster}
          className="border-b border-border bg-background/60 px-2 py-1.5 text-[11px] font-medium text-muted"
        >
          <span>Artikelcode</span>
          {assen.map((a) => (
            <span key={a.key}>{a.label}</span>
          ))}
          <span className="text-right">Advies €</span>
          <span className="text-right">Korting %</span>
          <span className="text-right">Inkoop €</span>
          <span>Foto (URL)</span>
          <span />
        </div>

        {rijen.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted">
            Nog geen uitvoeringen. Zet hierboven de keuzes klaar en laat de combinaties voorstellen, of voeg
            hieronder één regel toe.
          </p>
        )}

        {rijen.map((rij, i) => (
          <div
            key={rij.id ?? `n${i}`}
            style={raster}
            className="border-b border-border/40 px-2 py-1.5 last:border-b-0"
          >
            <input
              value={rij.code}
              onChange={(e) => wijzig(i, { code: e.target.value })}
              placeholder="5-GM-001"
              className={`${cell} font-mono text-xs`}
              title={labelVan(rij) || undefined}
            />
            {assen.map((as) => (
              <select
                key={as.key}
                value={rij.options[as.key] ?? ""}
                onChange={(e) => wijzig(i, { options: { ...rij.options, [as.key]: e.target.value } })}
                className={cell}
              >
                <option value="">—</option>
                {as.values.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            ))}
            <input
              value={rij.priceEur ?? ""}
              onChange={(e) => wijzig(i, { priceEur: numOrNull(e.target.value) })}
              type="number"
              step="0.01"
              min={0}
              placeholder="—"
              className={num}
            />
            <input
              value={rij.discountPct ?? ""}
              onChange={(e) => wijzig(i, { discountPct: numOrNull(e.target.value) })}
              type="number"
              step="0.1"
              min={0}
              max={100}
              placeholder={dealerDiscountPct != null ? String(dealerDiscountPct) : "—"}
              className={num}
            />
            <input
              value={rij.purchaseCostEur ?? ""}
              onChange={(e) => wijzig(i, { purchaseCostEur: numOrNull(e.target.value) })}
              type="number"
              step="0.01"
              min={0}
              placeholder="uit korting"
              className={num}
            />
            <input
              value={rij.imageUrl}
              onChange={(e) => wijzig(i, { imageUrl: e.target.value })}
              placeholder="https://…"
              className={`${cell} text-xs`}
            />
            <button
              type="button"
              onClick={() => setRijen((r) => r.filter((_, j) => j !== i))}
              className="rounded-md p-1.5 text-muted hover:bg-muted/50 hover:text-danger"
              title="Uitvoering verwijderen"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() =>
            setRijen((r) => [
              ...r,
              {
                code: "",
                options: {},
                priceEur: null,
                discountPct: dealerDiscountPct ?? null,
                purchaseCostEur: null,
                imageUrl: "",
                isActive: true,
              },
            ])
          }
          className="m-2 inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted hover:bg-muted/40"
        >
          <Plus className="size-3.5" /> Uitvoering toevoegen
        </button>
      </div>

      <p className="text-xs text-muted">
        {meeTeSturen.length} van de {rijen.length} regels heeft een artikelcode en wordt opgeslagen. Regels zonder
        code zijn alleen een voorstel — niet elke combinatie bestaat.
      </p>
    </div>
  );
}
