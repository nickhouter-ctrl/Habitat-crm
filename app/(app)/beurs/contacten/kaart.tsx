"use client";

/**
 * Waar de beursbezoekers zitten.
 *
 * Landgrenzen uit dezelfde kaartdata als het analytics-scherm, met per plek een
 * speldje; dezelfde stad wordt één speldje met een aantal. De kaart begint op
 * het gebied waar de bezoekers zitten en je kunt verder inzoomen en slepen —
 * vier speldjes in de provincie Valencia liggen anders over elkaar heen.
 *
 * Geen kaartendienst en geen tegels, alleen een SVG. Dat scheelt een
 * afhankelijkheid, laadt meteen, en er gaat geen enkel gegeven van een klant
 * naar een partij buiten ons.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";
import { Minus, Plus, RotateCcw } from "lucide-react";

import topo from "@/lib/geo/countries-110m.json";
import type { Bereik, Speld } from "@/lib/beurs-kaart";

const B = 800;
const H = 420;
const MIN = 1;
const MAX = 40;

type Blik = { k: number; x: number; y: number };
const BEGIN: Blik = { k: 1, x: 0, y: 0 };

export function BeursKaart({ spelden, bereik }: { spelden: Speld[]; bereik: Bereik }) {
  const [hover, setHover] = useState<{ tekst: string; x: number; y: number } | null>(null);
  const [blik, setBlik] = useState<Blik>(BEGIN);
  const svgRef = useRef<SVGSVGElement>(null);
  const sleep = useRef<{ x: number; y: number; blik: Blik } | null>(null);

  const { landen, punten } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(topo as any, (topo as any).objects.countries) as unknown as {
      features: Feature<Geometry, { name: string }>[];
    };
    // Passend maken op de twee hoeken van het gebied. Bewust géén vierhoek:
    // een ring die de verkeerde kant op loopt betekent voor d3 "de hele wereld
    // behalve dit vlak", en dan krijg je een wereldkaart met vier stipjes.
    const projectie = geoMercator().fitSize([B, H], {
      type: "MultiPoint",
      coordinates: [
        [bereik.west, bereik.south],
        [bereik.east, bereik.north],
      ],
    } as never);
    const pad = geoPath(projectie);
    return {
      landen: fc.features.map((f) => ({ d: pad(f) ?? "", naam: f.properties.name })),
      punten: spelden.map((s) => {
        const xy = projectie([s.lon, s.lat]);
        return {
          x: xy?.[0] ?? -999,
          y: xy?.[1] ?? -999,
          groot: Math.min(6, s.namen.length - 1),
          tekst: `${s.plaats} — ${s.namen.slice(0, 6).join(", ")}${s.namen.length > 6 ? ` +${s.namen.length - 6}` : ""}`,
        };
      }),
    };
  }, [spelden, bereik]);

  /** Muispositie in kaartcoördinaten (dus vóór de zoom). */
  function positieInKaart(e: { clientX: number; clientY: number }) {
    const vak = svgRef.current?.getBoundingClientRect();
    if (!vak) return { x: B / 2, y: H / 2 };
    return { x: ((e.clientX - vak.left) / vak.width) * B, y: ((e.clientY - vak.top) / vak.height) * H };
  }

  /** In- of uitzoomen met een vast punt: wat onder de muis zit blijft daar. */
  function zoom(factor: number, rond?: { x: number; y: number }) {
    setBlik((v) => {
      const k = Math.min(MAX, Math.max(MIN, v.k * factor));
      if (k === v.k) return v;
      const p = rond ?? { x: B / 2, y: H / 2 };
      // p = (scherm - x) / k  ⇒  x = scherm - p·k, met p gelijk vóór en na.
      const kaartX = (p.x - v.x) / v.k;
      const kaartY = (p.y - v.y) / v.k;
      return { k, x: p.x - kaartX * k, y: p.y - kaartY * k };
    });
  }

  // Zoomen met het wiel hangt er los aan: React luistert standaard "passief"
  // naar wheel, en dan kun je het scrollen van de pagina niet tegenhouden —
  // de kaart zou dan zoomen én de pagina zou wegschuiven.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const opWiel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, positieInKaart(e));
    };
    svg.addEventListener("wheel", opWiel, { passive: false });
    return () => svg.removeEventListener("wheel", opWiel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const knop =
    "grid size-8 place-items-center rounded-md border bg-surface text-muted shadow-sm transition-colors hover:bg-background hover:text-foreground";

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${B} ${H}`}
        className="h-auto w-full touch-none select-none rounded-lg bg-[#eef2f4]"
        style={{ cursor: sleep.current ? "grabbing" : "grab" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          sleep.current = { x: e.clientX, y: e.clientY, blik };
        }}
        onPointerMove={(e) => {
          const start = sleep.current;
          if (!start) return;
          const vak = svgRef.current?.getBoundingClientRect();
          if (!vak) return;
          const dx = ((e.clientX - start.x) / vak.width) * B;
          const dy = ((e.clientY - start.y) / vak.height) * H;
          setBlik({ k: start.blik.k, x: start.blik.x + dx, y: start.blik.y + dy });
        }}
        onPointerUp={() => {
          sleep.current = null;
        }}
        onPointerLeave={() => {
          sleep.current = null;
          setHover(null);
        }}
        onDoubleClick={(e) => zoom(1.8, positieInKaart(e))}
      >
        <g transform={`translate(${blik.x},${blik.y}) scale(${blik.k})`}>
          {landen.map((l, i) => (
            <path
              key={i}
              d={l.d}
              fill="#e2ded6"
              stroke="#fff"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {punten.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              // Het speldje moet even groot blijven als je inzoomt, anders wordt
              // het een vlek over de halve provincie.
              r={(4 + p.groot * 1.5) / blik.k}
              fill="#b6552d"
              fillOpacity={0.75}
              stroke="#fff"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => setHover({ tekst: p.tekst, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        <button type="button" className={knop} onClick={() => zoom(1.5)} aria-label="Inzoomen">
          <Plus className="size-4" />
        </button>
        <button type="button" className={knop} onClick={() => zoom(1 / 1.5)} aria-label="Uitzoomen">
          <Minus className="size-4" />
        </button>
        <button type="button" className={knop} onClick={() => setBlik(BEGIN)} aria-label="Terug naar het begin">
          <RotateCcw className="size-4" />
        </button>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 max-w-xs rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          {hover.tekst}
        </div>
      )}
    </div>
  );
}
