"use client";

/**
 * Waar de beursbezoekers zitten.
 *
 * Landgrenzen uit dezelfde kaartdata als het analytics-scherm, met per plek een
 * speldje; dezelfde stad wordt één speldje met een aantal. De kaart zoomt naar
 * de bezoekers toe: staat iedereen in Spanje, dan zie je Spanje.
 *
 * Geen kaartendienst en geen tegels — alleen een SVG. Dat scheelt een
 * afhankelijkheid, laadt meteen, en er gaat geen enkel gegeven van een klant
 * naar een partij buiten ons.
 */
import { useMemo, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Geometry } from "geojson";

import topo from "@/lib/geo/countries-110m.json";
import type { Bereik, Speld } from "@/lib/beurs-kaart";

const B = 800;
const H = 420;

export function BeursKaart({ spelden, bereik }: { spelden: Speld[]; bereik: Bereik }) {
  const [hover, setHover] = useState<{ tekst: string; x: number; y: number } | null>(null);

  const { landen, punten } = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc = feature(topo as any, (topo as any).objects.countries) as unknown as {
      features: Feature<Geometry, { name: string }>[];
    };
    const projectie = geoMercator().fitSize([B, H], {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [bereik.west, bereik.south],
                [bereik.east, bereik.south],
                [bereik.east, bereik.north],
                [bereik.west, bereik.north],
                [bereik.west, bereik.south],
              ],
            ],
          },
        },
      ],
    } as never);
    const pad = geoPath(projectie);
    const landen = fc.features.map((f) => ({ d: pad(f) ?? "", naam: f.properties.name }));
    const punten = spelden.map((s) => {
      const xy = projectie([s.lon, s.lat]);
      return {
        x: xy?.[0] ?? -999,
        y: xy?.[1] ?? -999,
        r: 4 + Math.min(6, s.namen.length - 1) * 1.5,
        tekst: `${s.plaats} — ${s.namen.slice(0, 6).join(", ")}${s.namen.length > 6 ? ` +${s.namen.length - 6}` : ""}`,
      };
    });
    return { landen, punten };
  }, [spelden, bereik]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${B} ${H}`} className="h-auto w-full rounded-lg bg-[#eef2f4]">
        <g>
          {landen.map((l, i) => (
            <path key={i} d={l.d} fill="#e2ded6" stroke="#fff" strokeWidth={0.5} />
          ))}
        </g>
        <g>
          {punten.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill="#b6552d"
              fillOpacity={0.75}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => setHover({ tekst: p.tekst, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => setHover((h) => (h ? { ...h, x: e.clientX, y: e.clientY } : h))}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </g>
      </svg>
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
