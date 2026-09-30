"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import { MapPin, Minus, Plus, RotateCcw, X } from "lucide-react";
import topo from "@/lib/geo/countries-110m.json";
import { rolLabel } from "@/lib/beurs";
import type { Bereik, Speld } from "@/lib/beurs-kaart";

const B = 900, H = 500;
const BEGIN = { k: 1, x: 0, y: 0 };
type Blik = typeof BEGIN;

export function BeursKaart({ spelden, bereik, taal = "nl", zonderLocatie = 0 }: {
  spelden: Speld[]; bereik: Bereik; taal?: "nl" | "en" | "es"; zonderLocatie?: number;
}) {
  const t = (nl: string, en: string, es: string) => taal === "es" ? es : taal === "en" ? en : nl;
  const [blik, setBlik] = useState<Blik>(BEGIN);
  const [selectie, setSelectie] = useState<number[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [unit, setUnit] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setUnit(Math.max(1, B / Math.max(1, entry.contentRect.width))));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const sleep = useRef<{ x: number; y: number; blik: Blik } | null>(null);
  const { landen, punten } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(topo as any, (topo as any).objects.countries) as unknown as { features: Feature<Geometry, { name: string }>[] };
    const projectie = geoMercator().fitExtent([[40, 40], [B - 40, H - 40]], {
      type: "MultiPoint", coordinates: [[bereik.west, bereik.south], [bereik.east, bereik.north]],
    });
    const pad = geoPath(projectie);
    return {
      landen: fc.features.map(f => ({ d: pad(f) ?? "", naam: f.properties.name })),
      punten: spelden.map((s, i) => { const xy = projectie([s.lon, s.lat])!; return { ...s, i, x: xy[0], y: xy[1] }; }),
    };
  }, [spelden, bereik]);

  // Clusters live in screen coordinates: zoom separates nearby places without
  // moving their geographic anchors (the former radial offsets did move them).
  const groepen = useMemo(() => {
    const uit: { x: number; y: number; leden: typeof punten }[] = [];
    for (const p of punten) {
      const x = p.x * blik.k + blik.x, y = p.y * blik.k + blik.y;
      if (x < -20 || x > B + 20 || y < -20 || y > H + 20) continue;
      const groep = uit.find(g => Math.hypot(g.x - x, g.y - y) < 30 * unit);
      if (groep) { const n = groep.leden.length; groep.x = (groep.x * n + x) / (n + 1); groep.y = (groep.y * n + y) / (n + 1); groep.leden.push(p); }
      else uit.push({ x, y, leden: [p] });
    }
    return uit;
  }, [punten, blik, unit]);
  const gekozen = selectie.map(i => spelden[i]).filter(Boolean);
  const aantal = spelden.reduce((n, s) => n + s.namen.length, 0);
  const plaatsen = [...new Set(spelden.map(s => s.plaats))].sort((a, b) => a.localeCompare(b));
  const labels: { x: number; y: number; width: number }[] = [];

  function zoom(factor: number) {
    setBlik(v => { const k = Math.max(1, Math.min(40, v.k * factor)); return { k, x: B / 2 - (B / 2 - v.x) * k / v.k, y: H / 2 - (H / 2 - v.y) * k / v.k }; });
  }
  function naarPlaats(plaats: string) {
    if (!plaats) { setBlik(BEGIN); setSelectie([]); return; }
    const p = punten.find(p => p.plaats === plaats)!;
    const k = Math.min(40, Math.max(3, blik.k));
    setBlik({ k, x: B / 2 - p.x * k, y: H / 2 - p.y * k });
    setSelectie(punten.filter(p => p.plaats === plaats).map(p => p.i));
  }
  const knop = "grid size-10 place-items-center rounded-lg border bg-surface text-foreground shadow-sm hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-40";

  return <div className="min-w-0 overflow-hidden rounded-xl border bg-surface">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-muted" /><strong>{aantal}</strong> {t("contacten op de kaart", "contacts on the map", "contactos en el mapa")}</div>
      <label className="flex items-center gap-2 text-xs text-muted">
        {t("Ga naar", "Go to", "Ir a")}
        <select aria-label={t("Ga naar een plaats", "Go to a place", "Ir a una localidad")} className="max-w-56 rounded-md border bg-surface px-2 py-2 text-sm text-foreground" value={gekozen.length && gekozen.every(s => s.plaats === gekozen[0].plaats) ? gekozen[0].plaats : ""} onChange={e => naarPlaats(e.target.value)}>
          <option value="">{t("Alle locaties", "All locations", "Todas las ubicaciones")}</option>
          {plaatsen.map(p => <option key={p}>{p}</option>)}
        </select>
      </label>
    </div>
    <div className="relative overflow-hidden bg-[#eaf0f2]">
      <svg ref={svgRef} viewBox={`0 0 ${B} ${H}`} role="group" aria-label={t("Kaart met beurscontacten", "Trade fair contact map", "Mapa de contactos de la feria")} className="block h-auto min-h-64 w-full touch-none select-none" style={{ aspectRatio: `${B}/${H}`, cursor: "grab" }}
        onPointerDown={e => { if ((e.target as Element).closest('[role="button"]')) return; e.currentTarget.setPointerCapture(e.pointerId); sleep.current = { x: e.clientX, y: e.clientY, blik }; }}
        onPointerMove={e => { const start = sleep.current, svg = svgRef.current; if (!start || !svg) return; const matrix = svg.getScreenCTM()?.inverse(); if (!matrix) return; const a = new DOMPoint(start.x, start.y).matrixTransform(matrix), b = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix); setBlik({ ...start.blik, x: start.blik.x + b.x - a.x, y: start.blik.y + b.y - a.y }); }}
        onPointerUp={() => { sleep.current = null; }} onPointerCancel={() => { sleep.current = null; }} onLostPointerCapture={() => { sleep.current = null; }}>
        <g transform={`translate(${blik.x},${blik.y}) scale(${blik.k})`} aria-hidden="true">
          {landen.map((l, i) => <path key={i} d={l.d} fill="#f8f6ef" stroke="#b6c3c7" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />)}
        </g>
        {groepen.map(g => {
          const n = g.leden.reduce((n, p) => n + p.namen.length, 0);
          const steden = [...new Set(g.leden.map(p => p.plaats))];
          const mixed = new Set(g.leden.map(p => p.kleur)).size > 1;
          const actief = g.leden.some(p => selectie.includes(p.i));
          const tekst = steden.length === 1 ? steden[0].split(" · ")[0] : `${steden.length} ${t("plaatsen", "places", "localidades")}`;
          const width = (tekst.length * 6.6 + 14) * unit, x = Math.max(width / 2 + 4, Math.min(B - width / 2 - 4, g.x)), y = g.y + 30 * unit;
          const toonLabel = actief || (y < H - 10 * unit && !groepen.some(other => other !== g && Math.abs(other.y - y) < 23 * unit && Math.abs(other.x - x) < width / 2 + 17 * unit) && !labels.some(l => Math.abs(l.y - y) < 20 * unit && Math.abs(l.x - x) < (l.width + width) / 2));
          if (toonLabel) labels.push({ x, y, width });
          const kies = () => setSelectie(g.leden.map(p => p.i));
          return <g key={g.leden.map(p => p.i).join("-")}>
            <g role="button" tabIndex={0} aria-pressed={actief} aria-label={`${steden.join(", ")} — ${n} ${t("contacten", "contacts", "contactos")}`} onClick={kies} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kies(); } }} className="cursor-pointer outline-none [&:focus-visible>circle:first-of-type]:stroke-[#172f3d]">
              <title>{`${steden.join(" / ")}: ${g.leden.flatMap(p => p.namen).join(", ")}`}</title>
              <circle cx={g.x} cy={g.y} r={19 * unit} fill={actief ? "#172f3d20" : "transparent"} stroke={actief ? "#172f3d" : "transparent"} strokeWidth={2 * unit} />
              <circle cx={g.x} cy={g.y} r={(n > 1 ? 13 : 9) * unit} fill={mixed ? "#334b59" : g.leden[0].kleur} stroke="white" strokeWidth={2.5 * unit} />
              {n > 1 && <text x={g.x} y={g.y + 4 * unit} textAnchor="middle" fill="white" fontSize={11 * unit} fontWeight={700} pointerEvents="none">{n}</text>}
            </g>
            {toonLabel && <g pointerEvents="none" aria-hidden="true"><rect x={x - width / 2} y={y - 11 * unit} width={width} height={18 * unit} rx={4 * unit} fill="#ffffff" fillOpacity={0.94} /><text x={x} y={y + 2 * unit} textAnchor="middle" fill="#30434d" fontSize={11 * unit} fontWeight={actief ? 700 : 500}>{tekst}</text></g>}
          </g>;
        })}
      </svg>
      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <button type="button" className={knop} disabled={blik.k >= 40} onClick={() => zoom(1.6)} aria-label={t("Inzoomen", "Zoom in", "Acercar")}><Plus className="size-4" /></button>
        <button type="button" className={knop} disabled={blik.k <= 1} onClick={() => zoom(1 / 1.6)} aria-label={t("Uitzoomen", "Zoom out", "Alejar")}><Minus className="size-4" /></button>
        <button type="button" className={knop} onClick={() => { setBlik(BEGIN); setSelectie([]); }} aria-label={t("Alle locaties tonen", "Show all locations", "Mostrar todas las ubicaciones")}><RotateCcw className="size-4" /></button>
      </div>
    </div>
    <div className="border-t px-4 py-3 text-xs leading-relaxed text-muted">
      {t("Locaties op plaatsniveau, geen exacte bedrijfsadressen. Klik op een stip voor de contacten. Een getal is het aantal contacten; zoom in om nabijgelegen plaatsen te scheiden.", "Locations are approximate, not exact business addresses. Select a dot to see contacts. Numbers show contact counts; zoom in to separate nearby places.", "Ubicaciones aproximadas, no direcciones exactas. Pulsa un punto para ver los contactos. El número indica los contactos; acerca el mapa para separar localidades cercanas.")}
      {zonderLocatie > 0 && <p className="mt-1 font-medium text-foreground">{zonderLocatie} {t("contacten zonder kaartlocatie — ze staan wel in de lijst.", "contacts without a map location — still included in the list.", "contactos sin ubicación en el mapa; sí aparecen en la lista.")}</p>}
    </div>
    {gekozen.length > 0 && <div className="relative border-t bg-background px-4 py-4" aria-live="polite">
      <button type="button" className="absolute right-3 top-3 rounded p-1 text-muted hover:text-foreground" aria-label={t("Details sluiten", "Close details", "Cerrar detalles")} onClick={() => setSelectie([])}><X className="size-4" /></button>
      <div className="grid gap-4 pr-7 sm:grid-cols-2">
        {gekozen.map((s, i) => <div key={`${s.plaats}-${s.rol}-${i}`}><div className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: s.kleur }} />{s.plaats}</div><p className="mt-1 text-xs text-muted">{rolLabel(s.rol, taal)} · {s.namen.length}</p><p className="mt-2 text-sm">{s.bedrijven.join(" · ")}</p><p className="mt-1 text-sm text-muted">{s.namen.join(", ")}</p></div>)}
      </div>
    </div>}
  </div>;
}
